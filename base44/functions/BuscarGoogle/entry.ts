import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { discoverGoogleIndustrial, brandTokensFromQuery } from '../../shared/googleCse.js';
import { normalizePartNumber, looksLikePartNumber } from '../../shared/searchRules.js';

// BUSCAR GOOGLE — capa de descubrimiento por Google CSE.
// NO depende de que el producto exista en Part, SearchIndex, DiscoveryIndex o CatalogProduct.
// NO escribe en la base de datos durante la consulta (la alimentación es asíncrona, en ExtraerFichaTecnica).
// Google encuentra la fuente real; la ficha se construye después desde esa fuente.
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

    const apiKey = secrets.get('industrialpediasearch') || '';
    const cx = '2725a736ccf564979';

    // 1) Descubrimiento Google (1-2 consultas máximo, con fallback técnico si es necesario).
    const discovery = await discoverGoogleIndustrial(query, apiKey, cx);

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

    return Response.json({
      query,
      google_results: discovery.results,
      knowledge_core_hits: knowledgeCoreHits,
      telemetry: {
        provider: discovery.provider,
        google_configured: discovery.telemetry.google_configured,
        queries_made: discovery.telemetry.queries_made,
        google_error: discovery.telemetry.google_error,
        google_detail: discovery.telemetry.google_detail,
        google_result_count: discovery.results.length
      }
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}