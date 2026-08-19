import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizePartNumber, looksLikePartNumber, tokenize, scorePart, rankComparator, isNonIndustrialQuery, isLikelyIndustrialSource } from '../../shared/searchRules.js';
import { discoverIndustrialWeb, isLikelyIndustrialResult, filterTrustedIndustrialResults } from '../../shared/webDiscovery.js';

// TEMP: mientras el Knowledge Core no tenga ningun Part en estado
// 'published' (revalidacion en curso), se incluye 'incomplete' para que
// BUSCAR muestre resultados reales en vez de una lista vacia. Los
// resultados incompletos se marcan explicitamente como tal (validation_state)
// y el frontend no debe presentarlos como verificados. Revertir a solo
// ['published'] cuando el pipeline vuelva a publicar Parts reales.
const DEFAULT_STATES = ['published', 'incomplete'];
const ALLOWED_STATES = ['published', 'validated', 'incomplete'];
const SCAN_LIMIT = 5000;

// Términos genéricos que no deben usarse solos para justificar una coincidencia.
// Si la consulta es "Schneider Electric", "electric" no debe hacer coincidir un
// Part Festo que contenga "electric" en su descripción. El filtro exige TODOS
// los tokens no-genéricos: "schneider" debe estar presente para que haya match.
const GENERIC_QUERY_TERMS = new Set([
  'electric', 'electrical', 'electronics', 'automation', 'product', 'products',
  'component', 'components', 'industrial', 'part', 'parts', 'supply', 'power',
  'control', 'system', 'systems', 'module', 'modules', 'device', 'devices',
  'electrico', 'electrica', 'electronica', 'automatizacion', 'producto',
  'productos', 'componente', 'componentes', 'refaccion', 'refacciones',
  'repuesto', 'repuestos', 'sistema', 'sistemas', 'modulo', 'modulos',
  'dispositivo', 'dispositivos', 'energia', 'potencia'
]);
function filterGenericTokens(tokens) {
  return tokens.filter((t) => !GENERIC_QUERY_TERMS.has(String(t).toLowerCase()));
}

function pushGrp(m, k, v) { (m[k] = m[k] || []).push(v); }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const q = String(body.q || '').trim();
    const filters = body.filters || {};
    const limit = Math.min(parseInt(body.limit, 10) || 25, 100);
    const offset = parseInt(body.offset, 10) || 0;

    // Registrar la ejecución inmediatamente. Esto permite distinguir un fallo de
    // BUSCAR de un fallo del proveedor web; la búsqueda no depende de este log.
    if (q) {
      await base44.asServiceRole.entities.SearchQueryLog.create({
        query: q,
        result_count: 0,
        duration_ms: 0,
        created_at: new Date().toISOString()
      }).catch(() => {});
    }

    // Gate de consultas no industriales: una consulta claramente no industrial
    // (recetas, música, moda, etc.) no debe producir resultados del Knowledge Core
    // ni del DiscoveryIndex, aunque registros viejos tengan texto contaminado.
    // Es generalizable: si hay contexto industrial explícito, la consulta pasa.
    if (q && isNonIndustrialQuery(q)) {
      return Response.json({
        q,
        knowledge_core_results: [],
        discovery_results: [],
        facets: { manufacturers: [], categories: [] }
      });
    }

    // Estados de validación: por defecto solo PUBLICADO.
    let states = DEFAULT_STATES;
    if (Array.isArray(filters.validation_states) && filters.validation_states.length) {
      states = filters.validation_states.filter((s) => ALLOWED_STATES.includes(s));
      if (!states.length) states = DEFAULT_STATES;
    }
    const stateQuery = { $in: states };

    const base = { validation_state: stateQuery };
    if (Array.isArray(filters.manufacturers) && filters.manufacturers.length) {
      base.manufacturer_name = { $in: filters.manufacturers };
    }
    if (Array.isArray(filters.categories) && filters.categories.length) {
      base.category = { $in: filters.categories };
    }

    // 1) Coincidencias estructurales exactas sobre el SearchIndex.
    //    BUSCAR consulta el índice del Knowledge Core; nunca invoca el crawler.
    const orClauses = [];
    if (q) {
      orClauses.push({ part_number: q });
      const qNorm = normalizePartNumber(q);
      if (qNorm) orClauses.push({ part_number_normalized: qNorm });
      orClauses.push({ manufacturer_name: q });
      orClauses.push({ category: q });
    }

    let candidates = [];
    let discoveryCandidates = [];
    let catalogCandidates = [];
    let webCandidates = [];
    // Mantener el diagnóstico web fuera del bloque de descubrimiento para que la
    // respuesta pueda devolverlo incluso cuando Google no encuentre resultados.
    let webTelemetry = { google_configured: false, google_error: null, google_detail: null, google_fallback_error: null };

    // Fuente primaria de recuperación: Part + SearchIndex. SearchIndex acelera,
    // pero BUSCAR nunca depende de que el índice esté perfecto para funcionar.
    // Esto permite buscar fichas reales aunque el índice haya quedado desactualizado.
    try {
      const directParts = await base44.asServiceRole.entities.Part.list('-updated_date', SCAN_LIMIT);
      const allowed = new Set(states);
      const direct = directParts.filter((p) => {
        if (!allowed.has(p.validation_state || 'processed')) return false;
        if (filters.manufacturers?.length && !filters.manufacturers.includes(p.manufacturer_name)) return false;
        if (filters.categories?.length && !filters.categories.includes(p.category)) return false;
        return true;
      });
      const byId = new Map();
      for (const p of direct) {
        byId.set(p.id, {
          ...p,
          part_id: p.id,
          part_number_normalized: p.part_number_normalized || normalizePartNumber(p.part_number || ''),
          search_text: [p.part_number, p.part_number_normalized, p.manufacturer_name, p.category, p.subcategory, p.description].filter(Boolean).join(' ')
        });
      }
      candidates = [...byId.values()];
    } catch (e) { candidates = []; }

    if (orClauses.length) {
      try {
        const indexed = await base44.asServiceRole.entities.SearchIndex.filter(
          { ...base, $or: orClauses }, '-updated_date', 5000
        );
        const merged = new Map(candidates.map((c) => [c.part_id || c.id, c]));
        for (const p of indexed) merged.set(p.part_id || p.id, { ...merged.get(p.part_id || p.id), ...p, part_id: p.part_id || p.id });
        candidates = [...merged.values()];
      } catch (e) { /* Part directo sigue siendo suficiente */ }
    }

    // IMPORTANTE: Part.list() arriba se usa como respaldo del índice, pero nunca
    // debe convertir todos los Parts de la base en candidatos de una consulta.
    // Antes de este filtro, una búsqueda como "Schneider Electric" podía cargar
    // todos los Parts y el scoring encontraba accidentalmente un Festo porque
    // compartía palabras genéricas como "electric" o "automation".
    // La recuperación debe ser relevante a la consulta ANTES del scoring.
    let exactManufacturerQuery = false;
    if (q) {
      const qNormForMatch = normalizePartNumber(q);
      const qTokensForMatch = filterGenericTokens(tokenize(q).map((t) => t.toLowerCase()).filter(Boolean));
      try {
        const normalizeManufacturer = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const normalizedQuery = normalizeManufacturer(q);
        if (normalizedQuery) {
          const manufacturers = await base44.asServiceRole.entities.Manufacturer.filter({ status: 'active' }, 'name', 500).catch(() => []);
          exactManufacturerQuery = manufacturers.some((m) => normalizeManufacturer(m.name) === normalizedQuery);
        }
      } catch { /* si no hay catálogo de fabricantes, se usa coincidencia textual */ }

      candidates = candidates.filter((p) => {
        const pn = normalizePartNumber(p.part_number || p.part_number_normalized || '');
        if (looksLikePartNumber(q)) return pn === qNormForMatch;
        if (exactManufacturerQuery) {
          const normalizeManufacturer = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
          return normalizeManufacturer(p.manufacturer_name) === normalizeManufacturer(q);
        }
        const haystack = [
          p.part_number, p.part_number_normalized, p.manufacturer_name,
          p.category, p.subcategory, p.title, p.description
        ].filter(Boolean).join(' ').toLowerCase();
        return qTokensForMatch.length > 0 && qTokensForMatch.every((token) => haystack.includes(token));
      });
    }

    // 2) Discovery Index: permite encontrar candidatos aún no publicados/validados.
    //    No ejecuta el crawler; consulta únicamente el índice persistido.
    const discoveryBase = {
      discovery_state: { $in: ['discovered', 'pending_verification', 'verified'] }
    };
    if (filters.manufacturers?.length) discoveryBase.manufacturer_name = { $in: filters.manufacturers };
    if (q) {
      const dqNorm = normalizePartNumber(q);
      const discoveryOr = [
        { candidate_part_number: q },
        ...(dqNorm ? [{ candidate_part_number_normalized: dqNorm }] : []),
        { manufacturer_name: q },
        { title: q },
        { search_text: q }
      ];
      // Si la consulta contiene un fabricante conocido, recuperamos todo su
      // universo descubierto sin depender del límite del scan de texto libre.
      try {
        const manufacturers = await base44.asServiceRole.entities.Manufacturer.list('-updated_date', 500);
        const qLower = q.toLowerCase();
        const manufacturerNames = manufacturers
          .map((m) => m.name)
          .filter(Boolean)
          .filter((name) => qLower.includes(String(name).toLowerCase()));
        for (const name of manufacturerNames) {
          const byManufacturer = await base44.asServiceRole.entities.DiscoveryIndex.filter(
            { ...discoveryBase, manufacturer_name: name }, '-updated_date', 5000
          ).catch(() => []);
          const seen = new Set(discoveryCandidates.map((d) => d.id));
          for (const d of byManufacturer) {
            if (!seen.has(d.id)) { discoveryCandidates.push(d); seen.add(d.id); }
          }
        }
      } catch (e) { /* búsqueda exacta sigue disponible */ }
      try {
        const directDiscovery = await base44.asServiceRole.entities.DiscoveryIndex.filter(
          { ...discoveryBase, $or: discoveryOr }, '-updated_date', 5000
        );
        const mergedDiscovery = new Map(discoveryCandidates.map((d) => [d.id, d]));
        for (const d of directDiscovery) mergedDiscovery.set(d.id, d);
        discoveryCandidates = [...mergedDiscovery.values()];
      } catch (e) { /* keep manufacturer discovery candidates */ }
      const discoveryScan = await base44.asServiceRole.entities.DiscoveryIndex.filter(discoveryBase, '-updated_date', 5000).catch(() => []);
      const dqTokens = filterGenericTokens(tokenize(q).map((t) => t.toLowerCase()).filter(Boolean));
      const seenDiscovery = new Set(discoveryCandidates.map((d) => d.id));
      for (const d of discoveryScan) {
        const text = `${d.candidate_part_number || ''} ${d.manufacturer_name || ''} ${d.title || ''} ${d.description || ''}`.toLowerCase();
        if (dqTokens.length && dqTokens.every((t) => text.includes(t)) && !seenDiscovery.has(d.id)) {
          discoveryCandidates.push(d); seenDiscovery.add(d.id);
        }
      }
    }

    const isPartNo = looksLikePartNumber(q);
    const queryTokensForDiscovery = tokenize(q);
    const skipWebDiscovery = body.skip_web_discovery === true;
    const hasDirectQueryMatch = candidates.some((p) => {
      const text = [p.part_number, p.part_number_normalized, p.manufacturer_name, p.category, p.subcategory, p.description, p.title]
        .filter(Boolean).join(' ').toLowerCase();
      if (isPartNo) {
        const pn = normalizePartNumber(p.part_number || p.part_number_normalized || '');
        return pn === normalizePartNumber(q);
      }
      return queryTokensForDiscovery.length > 0 && queryTokensForDiscovery.every((token) => text.includes(token));
    });

    // Filtro de relevancia para DiscoveryIndex: registros con fuentes no
    // industriales (marketplaces, sitios de música/películas) o contenido no
    // industrial no deben aparecer en resultados, aunque hayan sido persistidos
    // anteriormente con datos contaminados. Es generalizable.
    discoveryCandidates = discoveryCandidates.filter((d) =>
      isLikelyIndustrialSource(d.source_url, d.title, d.description)
    );

    // 3) DESCUBRIMIENTO WEB: si el Knowledge Core/DiscoveryIndex no tiene una
    //    coincidencia relevante, BUSCAR puede descubrir una fuente externa.
    //    Importante: candidates contiene Parts de la base aunque no coincidan con q;
    //    usar candidates.length aquí bloqueaba este flujo para cualquier búsqueda.
    //    La condición correcta es ausencia de coincidencia con la consulta.

    //    BUSCAR no se queda en cero. Consulta una fuente web externa determinística
    //    (Bing API si está configurada; DuckDuckGo HTML como fallback), sin IA.
    //    El resultado externo se registra en DiscoveryIndex y se muestra como
    //    "encontrado en fuente"; nunca se inventan especificaciones.
    if (!skipWebDiscovery && q && !hasDirectQueryMatch) {
      try {
        const webQuery = isPartNo ? q : `${q} industrial products part number catalog`;
        const web = await discoverIndustrialWeb(webQuery);
        webTelemetry = web?.telemetry || webTelemetry;

        // Registrar cada intento real de descubrimiento. No guardamos la API key ni
        // datos sensibles; esto permite comprobar en producción si Google respondió.
        try {
          await base44.asServiceRole.entities.SearchQueryLog.create({
            query: q,
            result_count: Number(web.results?.length || 0),
            duration_ms: 0,
            created_at: new Date().toISOString()
          });
        } catch (e) { /* observabilidad no debe bloquear BUSCAR */ }

        // Solo aceptamos fuentes de confianza para el buscador industrial:
        // 1) dominio oficial conocido del fabricante;
        // 2) dominio que coincide con el nombre del fabricante;
        // 3) distribuidor industrial explícitamente permitido.
        // Una página que solo contiene la palabra "Balluff" (por ejemplo un sitio
        // de reparación, blog, marketplace o revendedor no reconocido) NO entra.
        let manufacturerNames = [];
        let trustedOfficialDomains = [];
        try {
          const manufacturers = await base44.asServiceRole.entities.Manufacturer.list('-updated_date', 1000);
          const qLower = q.toLowerCase();
          const matched = manufacturers.filter((m) => {
            const name = String(m.name || '').toLowerCase();
            return name && qLower.includes(name);
          });
          manufacturerNames = matched.map((m) => m.name).filter(Boolean);
          trustedOfficialDomains = matched.map((m) => {
            try { return new URL(m.website).hostname; } catch { return ''; }
          }).filter(Boolean);

          // El CSE ya está configurado por el usuario con fabricantes industriales.
          // Esas fuentes oficiales deben seguir siendo confiables incluso cuando la
          // consulta sea SOLO un PN y todavía no sepamos la marca.
          const approvedSources = await base44.asServiceRole.entities.CrawlSource.filter(
            { state: { $in: ['approved', 'queued', 'crawling', 'downloaded', 'ingested', 'completed'] } },
            '-updated_date', 500
          ).catch(() => []);
          trustedOfficialDomains.push(...approvedSources.map((s) => String(s.domain || '').trim()).filter(Boolean));
          trustedOfficialDomains = [...new Set(trustedOfficialDomains)];

          // Si aún no conocemos la marca en la base, derivamos candidatos de marca
          // desde todos los tokens de la consulta, excluyendo términos técnicos y PNs.
          // No inferimos una fuente oficial a partir de palabras arbitrarias de la
          // consulta. Si la marca no está registrada, solo un CrawlSource aprobado
          // puede otorgar confianza oficial; así evitamos falsos positivos por prefijos.
        } catch (e) { /* los distribuidores conocidos siguen disponibles */ }

        const industrialMatches = web.results.filter(isLikelyIndustrialResult);
        const candidateResults = industrialMatches.length ? industrialMatches : web.results;
        const industrial = filterTrustedIndustrialResults(candidateResults, manufacturerNames, trustedOfficialDomains).slice(0, 50);
        // CRÍTICO DE RENDIMIENTO: no persistimos DiscoveryIndex/CatalogProduct ni
        // invocamos MaterializeDiscovery dentro de la petición del usuario. Con 50
        // resultados eso puede generar cientos de llamadas secuenciales y timeout.
        // Primero devolvemos resultados web reales; la persistencia queda para un
        // proceso de ingestión separado.
        const seenWeb = new Set();
        for (const r of industrial) {
          let host = '';
          try { host = new URL(r.url).hostname; } catch {}
          const candidatePn = isPartNo ? q : '';
          const webKey = String(r.url || '').replace(/#.*$/, '').toLowerCase();
          if (!webKey || seenWeb.has(webKey)) continue;
          seenWeb.add(webKey);
          const manufacturer = manufacturerNames.length === 1
            ? manufacturerNames[0]
            : (manufacturerNames.find((name) => `${r.title || ''} ${r.snippet || ''}`.toLowerCase().includes(String(name).toLowerCase())) || '');
          const webText = `${candidatePn} ${manufacturer} ${r.title || ''} ${r.snippet || ''} ${host}`.toLowerCase();
          const hits = tokenize(q).filter((t) => webText.includes(t)).length;
          webCandidates.push({
            part: {
              part_number: candidatePn,
              part_number_normalized: candidatePn ? normalizePartNumber(candidatePn) : '',
              manufacturer_name: manufacturer,
              category: '',
              description: r.snippet || r.title || '',
              title: r.title || host,
              image_url: ''
            },
            specs: [],
            evidence: [],
            score: isPartNo ? 1000 + hits * 10 : 250 + hits * 40,
            match: isPartNo ? 'web_exact_query' : 'web_discovery_match',
            discovery: {
              id: null,
              source_url: r.url,
              document_url: r.url,
              title: r.title || host,
              description: r.snippet || '',
              discovery_state: 'discovered',
              manufacturer_name: manufacturer,
              source_type: r.source_type,
              source_provider: web.provider
            }
          });
        }
      } catch (e) { /* Knowledge Core sigue siendo la fuente primaria */ }
    }

    // 4) Para texto libre (no número de parte), scan acotado + filtro en código
    //    (la plataforma no expone $regex; este scan está limitado y respeta filtros).
    const tokens = tokenize(q);
    if (q && !isPartNo && tokens.length) {
      // Los Parts ya fueron cargados directamente arriba. SearchIndex solo aporta
      // aceleración/metadata; no puede ocultar una ficha existente.
      try {
        const scan = await base44.asServiceRole.entities.SearchIndex.filter(base, '-updated_date', SCAN_LIMIT);
        const seen = new Set(candidates.map((c) => c.part_id || c.id));
        const scanTokens = filterGenericTokens(tokenize(q).map((t) => t.toLowerCase()).filter(Boolean));
        const normalizeManufacturer = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        for (const p of scan) {
          const key = p.part_id || p.id;
          const haystack = [p.part_number, p.part_number_normalized, p.manufacturer_name, p.category, p.subcategory, p.title, p.description]
            .filter(Boolean).join(' ').toLowerCase();
          const relevant = exactManufacturerQuery
            ? normalizeManufacturer(p.manufacturer_name) === normalizeManufacturer(q)
            : scanTokens.length > 0 && scanTokens.every((token) => haystack.includes(token));
          if (relevant && !seen.has(key)) { candidates.push({ ...p, part_id: p.part_id || p.id }); seen.add(key); }
        }
      } catch (e) { /* Part directo sigue siendo suficiente */ }
    }

    // 5) Recuperar productos ya almacenados en nuestro catálogo propio.
    //    Las coincidencias exactas de PN/marca se recuperan sin volver a consultar la web.
    if (q) {
      try {
        const catalogOr = [
          { part_number: q },
          { part_number_normalized: normalizePartNumber(q) },
          { manufacturer_name: q }
        ];
        const stored = await base44.asServiceRole.entities.CatalogProduct.filter(
          { catalog_state: { $in: ['discovered', 'identified', 'materialized'] }, $or: catalogOr },
          '-updated_date', 500
        );
        const seen = new Set(catalogCandidates.map((c) => c.id));
        for (const c of stored) {
          if (!seen.has(c.id)) { catalogCandidates.push(c); seen.add(c.id); }
        }
      } catch (e) { /* catálogo aún vacío */ }
    }

    // 6) Modo exploración: solo filtros, sin texto.
    if (!q && ((filters.manufacturers && filters.manufacturers.length) || (filters.categories && filters.categories.length))) {
      try {
        candidates = await base44.asServiceRole.entities.SearchIndex.filter(base, '-updated_date', 5000);
      } catch (e) { candidates = []; }
    }

    // 7) Cargar especificaciones y evidencia para los candidatos ($in, una llamada cada uno).
    // SearchIndex.id identifies the index row; part_id identifies the Knowledge Core Part.
    const ids = [...new Set(candidates.map((c) => c.part_id || c.id).filter(Boolean))];
    const specsByPart = {};
    const evidenceByPart = {};
    if (ids.length) {
      try {
        const specs = await base44.asServiceRole.entities.Specification.filter(
          { part_id: { $in: ids } }, '-updated_date', 2000
        );
        specs.forEach((s) => pushGrp(specsByPart, s.part_id, s));
        // Knowledge Core search: include the technical attribute/value text in scoring.
        // This is deterministic and uses only structured Specification records; no AI.
        if (q && !isPartNo && tokens.length) {
          for (const s of specs) {
            const attr = String(s.attribute_canonical || s.attribute_name || '').toLowerCase();
            const value = String(s.normalized_value || s.original_value || '').toLowerCase();
            const unit = String(s.normalized_unit || s.original_unit || '').toLowerCase();
            const haystack = `${attr} ${value} ${unit}`;
            if (tokens.some((t) => haystack.includes(t))) {
              s.__search_text_match = true;
            }
          }
        }
      } catch (e) { /* sin specs */ }
      try {
        const ev = await base44.asServiceRole.entities.Evidence.filter(
          { part_id: { $in: ids } }, '-updated_date', 2000
        );
        ev.forEach((e) => pushGrp(evidenceByPart, e.part_id, e));
      } catch (e) { /* sin evidencia */ }
    }

    // 8) Scoring + filtros derivados de specs.
    let scored = candidates.map((p) => {
      const specs = specsByPart[p.part_id || p.id] || [];
      const { score, match } = scorePart(p, q, specs);
      return { part: p, specs, evidence: evidenceByPart[p.part_id || p.id] || [], score, match, discovery: null };
    });

    // Discovery results are intentionally separate from verified Knowledge Core results.
    // A discovered candidate may be shown, but its state/source remain explicit and it never
    // contributes invented specifications.
    const indexedPartIds = new Set(candidates.map((p) => p.part_id).filter(Boolean));
    for (const w of webCandidates) {
      const webText = `${w.part.part_number || ''} ${w.part.manufacturer_name || ''} ${w.part.title || ''} ${w.part.description || ''}`.toLowerCase();
      const hits = tokenize(q).filter((t) => webText.includes(t)).length;
      if (isPartNo || hits > 0) scored.push(w);
    }
    for (const d of discoveryCandidates) {
      if (d.part_id && indexedPartIds.has(d.part_id)) continue;
      const pseudoPart = {
        part_number: d.candidate_part_number,
        part_number_normalized: d.candidate_part_number_normalized,
        manufacturer_name: d.manufacturer_name,
        category: '',
        description: [d.title || '', d.description || ''].filter(Boolean).join(' '),
        title: d.title || '',
        image_url: d.image_url || ''
      };
      const { score: rankedScore, match: rankedMatch } = scorePart(pseudoPart, q, []);
      const discoveryText = `${d.candidate_part_number || ''} ${d.manufacturer_name || ''} ${d.title || ''} ${d.description || ''} ${d.source_url || ''}`.toLowerCase();
      const queryTokens = filterGenericTokens(tokenize(q).map((t) => t.toLowerCase()).filter(Boolean));
      const discoveryHits = queryTokens.filter((t) => discoveryText.includes(t)).length;
      const score = rankedScore > 0 ? rankedScore : (discoveryHits > 0 ? 250 + discoveryHits * 20 : 0);
      const match = rankedScore > 0 ? rankedMatch : (discoveryHits > 0 ? 'web_discovery_match' : 'none');
      if (score > 0) scored.push({
        part: { ...pseudoPart, part_id: d.part_id || null, validation_state: d.discovery_state === 'verified' ? 'validated' : 'incomplete',
          source_url: d.source_url, document_url: d.document_url },
        specs: [], evidence: [], score, match, discovery: d
      });
    }

    // Productos del catálogo propio: son descubrimientos persistidos, no fichas verificadas.
    for (const c of catalogCandidates) {
      const pseudoPart = {
        part_number: c.part_number || '',
        part_number_normalized: c.part_number_normalized || '',
        manufacturer_name: c.manufacturer_name || '',
        category: c.category || '',
        description: c.description || '',
        title: c.name || '',
        image_url: c.image_url || ''
      };
      const { score: rankedScore, match: rankedMatch } = scorePart(pseudoPart, q, []);
      const catalogText = `${c.part_number || ''} ${c.manufacturer_name || ''} ${c.name || ''} ${c.description || ''} ${c.search_text || ''}`.toLowerCase();
      const catalogTokens = tokenize(q);
      const hits = catalogTokens.filter((t) => catalogText.includes(t)).length;
      const score = rankedScore > 0 ? rankedScore : (hits ? 220 + hits * 25 : 0);
      if (score > 0) {
        scored.push({
          part: { ...pseudoPart, part_id: null, catalog_id: c.id, validation_state: 'incomplete', source_url: c.product_url, document_url: c.datasheet_url || c.product_url },
          specs: [], evidence: [], score, match: rankedScore > 0 ? rankedMatch : 'catalog_match',
          discovery: { id: c.discovery_id || null, source_url: c.product_url, document_url: c.datasheet_url || c.product_url, title: c.name, discovery_state: c.catalog_state, manufacturer_name: c.manufacturer_name }
        });
      }
    }

    if (filters.has_specification === true) {
      scored = scored.filter((r) => r.specs.length > 0);
    }
    if (Array.isArray(filters.specs) && filters.specs.length) {
      scored = scored.filter((r) => filters.specs.every((f) =>
        r.specs.some((s) => s.attribute_canonical === f.attribute_canonical &&
          String(s.normalized_value) === String(f.value))
      ));
    }
    if (q) scored = scored.filter((r) => r.score > 0 || r.specs.some((s) => s.__search_text_match));

    // Separación estricta: Knowledge Core (Parts persistidos) vs DiscoveryIndex/
    // Catalog/web (fuentes descubiertas). Un registro descubierto nunca aparece
    // en la sección Knowledge Core, y viceversa.
    const kcScored = scored.filter((r) => !r.discovery);
    const discoveryScored = scored.filter((r) => Boolean(r.discovery));
    kcScored.sort(rankComparator);
    discoveryScored.sort(rankComparator);

    const unique = (arr) => [...new Set(arr.filter(Boolean))];
    const mapResult = (r) => ({
      id: r.part.part_id || null,
      catalog_id: r.part.catalog_id || null,
      discovery_id: r.discovery?.id || null,
      part_number: r.part.part_number,
      manufacturer_name: r.part.manufacturer_name,
      category: r.part.category,
      subcategory: r.part.subcategory,
      description: r.part.description,
      image_url: r.part.image_url,
      validation_state: r.part.validation_state,
      match: r.match,
      has_evidence: r.evidence.length > 0,
      evidence_count: r.evidence.length,
      source_ids: unique(r.specs.map((s) => s.source_id)),
      spec_count: r.specs.length,
      discovery_state: r.discovery?.discovery_state || null,
      source_url: r.discovery?.source_url || null,
      document_url: r.discovery?.document_url || null,
      title: r.part.title || r.discovery?.title || '',
      source_title: r.discovery?.title || '',
      top_specs: r.specs.slice(0, 4).map((s) => ({
        attribute: s.attribute_canonical || s.attribute_name,
        value: s.normalized_value || s.original_value,
        unit: s.normalized_unit || s.original_unit,
        validated: s.validation_state === 'published' || s.validation_state === 'validated'
      }))
    });

    const knowledge_core_results = kcScored.slice(0, limit).map(mapResult);
    const discovery_results = discoveryScored.slice(0, limit).map(mapResult);

    // Facetas desde Knowledge Core (pre-paginación).
    const mfCounts = {};
    const catCounts = {};
    kcScored.forEach((r) => {
      if (r.part.manufacturer_name) mfCounts[r.part.manufacturer_name] = (mfCounts[r.part.manufacturer_name] || 0) + 1;
      if (r.part.category) catCounts[r.part.category] = (catCounts[r.part.category] || 0) + 1;
    });

    return Response.json({
      q,
      knowledge_core_results,
      discovery_results,
      facets: {
        manufacturers: Object.entries(mfCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        categories: Object.entries(catCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}