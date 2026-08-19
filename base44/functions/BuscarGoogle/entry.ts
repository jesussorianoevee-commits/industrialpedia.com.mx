import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets, waitUntil } from 'base44:runtime';
import { discoverTavilyIndustrial, brandTokensFromQuery, isLikelyIndustrialTavilyResult, isProductResultForManufacturer } from '../../shared/tavilySearch.js';
import { normalizePartNumber, looksLikePartNumber } from '../../shared/searchRules.js';
import { persistDiscoveryResults } from '../../shared/discoveryPersist.js';
import { isUsableProductImageCandidate, selectBestImage } from '../../shared/imageResolver.js';

// BUSCAR GOOGLE — capa de descubrimiento web (Tavily) con cache en base de datos.
// Toda búsqueda se guarda en SearchQueryLog. Al repetir la misma consulta, los
// resultados se devuelven desde la base sin recurrir al buscador web.
// La alimentación del Knowledge Core (Part/Spec/Evidence) sigue siendo asíncrona,
// en ExtraerFichaTecnica al abrir la ficha.
//
// Contrato:
// { query: string }
// Devuelve: { google_results: [...], knowledge_core_hits: [...], telemetry }

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const query = String(body.query || '').trim();
    if (!query) return Response.json({ error: 'query required' }, { status: 400 });

    const apiKey = String(secrets.get('Apy_Tavly') || '').trim().replace(/^["']|["']$/g, '').trim();
    const queryNorm = query.toLowerCase().replace(/\s+/g, ' ').trim();
    const queryTokens = query.split(/\s+/).filter(Boolean);
    let manufacturerOnly = queryTokens.length === 1 && brandTokensFromQuery(query).length === 1;
    // El catálogo de Manufacturer es la fuente de verdad cuando la consulta
    // coincide exactamente con un fabricante. Esto cubre fabricantes de varias
    // palabras (p. ej. Rockwell Automation / Schneider Electric) sin convertir
    // consultas normales como "Festo cilindro" en búsquedas de fabricante.
    try {
      const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const qManufacturer = normalize(query);
      if (qManufacturer) {
        const manufacturers = await base44.asServiceRole.entities.Manufacturer.filter({ status: 'active' }, 'name', 500);
        manufacturerOnly = manufacturers.some((m: any) => normalize(m.name) === qManufacturer);
      }
    } catch { /* fallback heurístico de una sola palabra */ }

    // 1) Cache: si esta consulta ya se buscó, devolver los resultados guardados
    //    sin recurrir al buscador web. La base sigue siendo la fuente de verdad,
    //    pero los resultados cacheados pasan por las mismas defensas actuales de
    //    relevancia e imágenes. Así una corrección del resolver no queda anulada
    //    por datos viejos (por ejemplo un logo guardado antes del fix).
    let discovery: any = null;
    let cached = false;
    try {
      const cachedRecs = await base44.asServiceRole.entities.SearchQueryLog.filter(
        { query_normalized: queryNorm }, '-created_date', 1
      );
      if (cachedRecs.length && Array.isArray(cachedRecs[0].results) && cachedRecs[0].results.length) {
        const safeCachedResults = cachedRecs[0].results
          .filter((r: any) =>
            isLikelyIndustrialTavilyResult(r, query) &&
            (!manufacturerOnly || isProductResultForManufacturer(r))
          )
          .map((r: any) => {
            const copy = { ...r };
            if (!isUsableProductImageCandidate(copy.image_url, copy.title, copy.description || copy.snippet)) {
              copy.image_url = '';
              copy.image_method = '';
              copy.image_confidence = 0;
            }
            return copy;
          });
        if (safeCachedResults.length) {
          discovery = { results: safeCachedResults, provider: 'cache', telemetry: { configured: true, queries_made: 0, error: null, detail: null } };
          cached = true;
        }
      }
    } catch { /* cache miss → buscar en la web */ }

    if (!discovery) {
      discovery = await discoverTavilyIndustrial(query, apiKey, { manufacturerOnly });
      // Guardar en cache (sin raw_content para no exceder el tamaño del registro).
      const trimmed = discovery.results.map((r: any) => {
        const rest: any = { ...r };
        delete rest.raw_content;
        return rest;
      });
      try {
        await base44.asServiceRole.entities.SearchQueryLog.create({
          query,
          query_normalized: queryNorm,
          result_count: trimmed.length,
          results: trimmed,
          duration_ms: 0
        });
      } catch { /* el cache es best-effort */ }
    }

    // 2) Chequeo ligero del Knowledge Core en paralelo: si ya tenemos la pieza
    //    verificada, la mostramos arriba como resultado verificado. Una sola
    //    consulta por índice, no cientos de operaciones secuenciales.
    const knowledgeCoreHits: any[] = [];
    const qNorm = normalizePartNumber(query);
    const partLike = looksLikePartNumber(query);
    if (partLike && qNorm) {
      try {
        const parts = await base44.asServiceRole.entities.Part.filter(
          { part_number_normalized: qNorm, validation_state: { $in: ['published', 'incomplete', 'validated'] } },
          '-updated_date', 5
        );
        for (const p of parts) {
          knowledgeCoreHits.push({
            id: p.id,
            part_number: p.part_number,
            manufacturer_name: p.manufacturer_name,
            category: p.category,
            description: p.description,
            validation_state: p.validation_state,
            verified: true,
            source: 'knowledge_core'
          });
        }
      } catch { /* Knowledge Core queda como fuente secundaria */ }
    }

    // Si no es PN pero la consulta contiene una marca conocida, buscamos Parts de esa marca.
    if (!knowledgeCoreHits.length && !partLike) {
      const brandTokens = brandTokensFromQuery(query);
      if (brandTokens.length) {
        try {
          const parts = await base44.asServiceRole.entities.Part.filter(
            { manufacturer_name: brandTokens[0], validation_state: { $in: ['published', 'incomplete', 'validated'] } },
            '-updated_date', 10
          );
          for (const p of parts) {
            knowledgeCoreHits.push({
              id: p.id,
              part_number: p.part_number,
              manufacturer_name: p.manufacturer_name,
              category: p.category,
              description: p.description,
              validation_state: p.validation_state,
              verified: true,
              source: 'knowledge_core'
            });
          }
        } catch { /* ignore */ }
      }
    }

    // 3) Persistencia asíncrona en DiscoveryIndex (no bloquea la respuesta).
    //    Cada resultado descubierto queda en la base: URL, título, descripción,
    //    fabricante/PN sólo si están demostrados, imagen, proveedor y estado.
    //    CatalogProduct se materializa después, al abrir la ficha, con evidencia.
    if (Array.isArray(discovery.results) && discovery.results.length) {
      waitUntil(persistDiscoveryResults(base44, discovery.results).catch(() => {}));
    }

    return Response.json({
      query,
      google_results: discovery.results,
      knowledge_core_hits: knowledgeCoreHits,
      telemetry: {
        provider: discovery.provider,
        cached,
        google_configured: discovery.telemetry.configured,
        queries_made: discovery.telemetry.queries_made,
        google_error: discovery.telemetry.error,
        google_detail: discovery.telemetry.detail,
        google_result_count: discovery.results.length
      }
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}