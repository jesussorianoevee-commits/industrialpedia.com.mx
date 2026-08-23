import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { searchIndustrialpedia, INDUSTRIALPEDIA_API_VERSION } from '../../shared/supabaseIndustrialpediaApi.js';
import { looksLikePartNumber } from '../../shared/searchRules.js';

const GENERIC_QUERY_TERMS = new Set([
  'sensor', 'sensores', 'industrial', 'industriales', 'refaccion', 'refacciones', 'repuesto', 'repuestos',
  'componente', 'componentes', 'producto', 'productos', 'part', 'parts', 'device', 'devices'
]);

function normalizeText(value: any) {
  return String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9./+-]+/g, ' ').replace(/\\s+/g, ' ').trim();
}

function queryTokens(value: any) {
  return normalizeText(value).split(' ').filter((t) => t.length > 1);
}

function semanticFallbackScore(part: any, specs: any[], q: string) {
  const tokens = queryTokens(q);
  const useful = tokens.filter((t) => !GENERIC_QUERY_TERMS.has(t));
  if (!useful.length) return 0;

  const baseText = normalizeText([
    part.part_number, part.part_number_normalized, part.manufacturer_name,
    part.category, part.subcategory, part.description
  ].filter(Boolean).join(' '));
  const specText = specs.map((s) => normalizeText([
    s.attribute_canonical, s.attribute_name, s.original_value, s.normalized_value,
    s.original_unit, s.normalized_unit
  ].filter(Boolean).join(' '))).join(' ');
  const haystack = `${baseText} ${specText}`;
  const hits = useful.filter((token) => haystack.includes(token)).length;
  if (hits !== useful.length) return 0;

  // Descripción + especificaciones técnicas cuentan más que una coincidencia
  // genérica. No inventamos equivalencias: cada término debe existir en los datos.
  const descHits = useful.filter((token) => baseText.includes(token)).length;
  const specHits = useful.filter((token) => specText.includes(token)).length;
  return 300 + descHits * 35 + specHits * 45;
}

function mapSupabaseResult(r: any) {
  return {
    id: r.part_id || null,
    part_number: r.part_number || '',
    manufacturer_name: r.manufacturer || '',
    category: r.category || '',
    description: r.description || r.name || '',
    // Keep the full technical payload so the ficha can render the same
    // specifications returned by the Knowledge Core search result.
    specifications: r.specifications && typeof r.specifications === 'object' ? r.specifications : {},
    title: r.name || r.part_number || '',
    image_url: r.image_url || r.image?.image_url || r.image?.url || r.primary_image_url || '',
    image_verification_status: r.image_verification_status || r.image?.verification_status || null,
    image_source: r.image_source || r.image?.source_url || r.image?.source || null,
    image_is_primary: r.image_is_primary === true || r.image?.is_primary === true,
    validation_state: r.status === 'verified' ? 'published' : r.status || 'incomplete',
    match: r.match_type || 'candidate',
    has_evidence: false,
    evidence_count: 0,
    spec_count: r.specifications ? Object.keys(r.specifications).length : 0,
    source_ids: [],
    discovery_state: r.discovery_state || null,
    source_url: null,
    document_url: null,
    top_specs: r.specifications
      ? Object.entries(r.specifications).slice(0, 6).map(([attribute, value]: any) => ({
          attribute,
          value: typeof value === 'object' && value !== null ? value.value ?? value : value,
          unit: typeof value === 'object' && value !== null ? value.unit ?? null : null,
          validated: true
        }))
      : [],
    api_match_type: r.match_type || null,
    api_score: r.score ?? null,
    quantity_match_state: r.quantity_match_state || null,
    quantity_difference: r.quantity_difference ?? null,
    quantity_difference_unit: r.quantity_difference_unit || null,
    classification_code: r.classification_code || null
  };
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const q = String(body.q || '').trim();
    if (!q) {
      return Response.json({
        q: '', knowledge_core_results: [], discovery_results: [], web_results: [],
        facets: { manufacturers: [], categories: [] },
        meta: { api_version: INDUSTRIALPEDIA_API_VERSION, providers: ['supabase_knowledge_core'] }
      });
    }

    const filters = body.filters || {};
    const limit = Math.min(parseInt(body.limit, 10) || 25, 50);
    const requestedManufacturers = Array.isArray(filters.manufacturers) ? filters.manufacturers : [];
    const manufacturer = requestedManufacturers.length === 1 ? requestedManufacturers[0] : '';

    // PRIMARY SOURCE: frozen Supabase Industrialpedia API v8.
    // Base44 is now only the application/UI layer; it does not reimplement
    // Knowledge Core search logic here.
    const api = await searchIndustrialpedia(q, limit, manufacturer);
    let knowledgeCore = Array.isArray(api.results) ? api.results.map(mapSupabaseResult) : [];

    // SEMANTIC DESCRIPTION FALLBACK:
    // La búsqueda canónica sigue siendo Supabase/Knowledge Core. Cuando una
    // consulta descriptiva no devuelve suficientes candidatos, usamos el índice
    // estructurado de Base44 como segunda capa para recuperar por descripción y
    // especificaciones técnicas. Esto permite consultas como "sensor negro de
    // 5 mm" sin obligar al usuario a conocer el número de parte.
    // Cada término relevante debe estar demostrado en descripción o especificación;
    // no se hacen coincidencias por palabras genéricas ni se inventan atributos.
    // Un número de parte es una consulta determinística de identidad. Si el
    // Knowledge Core no devuelve coincidencia, NO debemos lanzar el fallback masivo
    // de Part.list()+Specification.filter(): esa ruta escanea miles de registros,
    // puede agotar el tiempo de ejecución y convertir un "no encontrado" en timeout.
    // El fallback descriptivo queda reservado para consultas de texto libre.
    if (q && !looksLikePartNumber(q) && knowledgeCore.length < limit) {
      try {
        const states = new Set(
          Array.isArray(filters.validation_states) && filters.validation_states.length
            ? filters.validation_states
            : ['published', 'validated', 'incomplete']
        );
        const parts = await base44.asServiceRole.entities.Part.list('-updated_date', 5000);
        const allowedParts = parts.filter((p: any) => {
          if (!states.has(p.validation_state || 'processed')) return false;
          if (requestedManufacturers.length && !requestedManufacturers.includes(p.manufacturer_name)) return false;
          if (Array.isArray(filters.categories) && filters.categories.length && !filters.categories.includes(p.category)) return false;
          return true;
        });
        const ids = allowedParts.map((p: any) => p.id).filter(Boolean);
        const specs = ids.length
          ? await base44.asServiceRole.entities.Specification.filter({ part_id: { $in: ids } }, '-updated_date', 10000).catch(() => [])
          : [];
        const specsByPart: Record<string, any[]> = {};
        for (const s of specs) (specsByPart[s.part_id] ||= []).push(s);

        const existingIds = new Set(knowledgeCore.map((r: any) => r.id).filter(Boolean));
        const fallback = allowedParts.map((p: any) => {
          const partSpecs = specsByPart[p.id] || [];
          const score = semanticFallbackScore(p, partSpecs, q);
          if (!score || existingIds.has(p.id)) return null;
          return {
            id: p.id,
            part_number: p.part_number || '',
            manufacturer_name: p.manufacturer_name || '',
            category: p.category || '',
            description: p.description || '',
            specifications: Object.fromEntries(partSpecs.map((s: any) => [
              s.attribute_canonical || s.attribute_name,
              { value: s.normalized_value ?? s.original_value ?? '', unit: s.normalized_unit ?? s.original_unit ?? '' }
            ]).filter(([k]) => k)),
            title: p.description || p.part_number || '',
            image_url: p.image_url || '',
            image_verification_status: null,
            image_source: null,
            image_is_primary: false,
            validation_state: p.validation_state || 'incomplete',
            match: 'semantic_description',
            has_evidence: false,
            evidence_count: 0,
            spec_count: partSpecs.length,
            source_ids: partSpecs.map((s: any) => s.source_id).filter(Boolean),
            discovery_state: null,
            source_url: null,
            document_url: null,
            top_specs: partSpecs.slice(0, 6).map((s: any) => ({
              attribute: s.attribute_canonical || s.attribute_name,
              value: s.normalized_value ?? s.original_value,
              unit: s.normalized_unit ?? s.original_unit,
              validated: s.validation_state === 'published' || s.validation_state === 'validated'
            })),
            api_match_type: 'semantic_description',
            api_score: score
          };
        }).filter(Boolean);
        fallback.sort((a: any, b: any) => (b.api_score || 0) - (a.api_score || 0));
        knowledgeCore = [...knowledgeCore, ...fallback].slice(0, limit);
      } catch { /* la capa canónica sigue siendo suficiente si el fallback falla */ }
    }

    const allowedStates = Array.isArray(filters.validation_states) && filters.validation_states.length
      ? new Set(filters.validation_states)
      : new Set(['published', 'validated', 'incomplete']);
    const categories = Array.isArray(filters.categories) ? new Set(filters.categories) : null;
    const onlySpecs = Boolean(filters.has_specification);

    knowledgeCore = knowledgeCore.filter((r) => {
      if (r.validation_state && !allowedStates.has(r.validation_state)) return false;
      if (categories?.size && !categories.has(r.category)) return false;
      if (onlySpecs && !r.spec_count) return false;
      return true;
    });

    // WEB DISCOVERY IS FROZEN LEGACY.
    // It is intentionally NOT executed from the primary search path.
    // The Industrialpedia API / Knowledge Core is the sole source for search results.
    const webResults: any[] = [];

    const manufacturers: Record<string, number> = {};
    const cats: Record<string, number> = {};
    knowledgeCore.forEach((r) => {
      if (r.manufacturer_name) manufacturers[r.manufacturer_name] = (manufacturers[r.manufacturer_name] || 0) + 1;
      if (r.category) cats[r.category] = (cats[r.category] || 0) + 1;
    });

    return Response.json({
      q,
      knowledge_core_results: knowledgeCore,
      discovery_results: [],
      web_results: webResults,
      facets: {
        manufacturers: Object.entries(manufacturers).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        categories: Object.entries(cats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
      },
      meta: {
        api_version: INDUSTRIALPEDIA_API_VERSION,
        providers: ['supabase_knowledge_core'],
        source_policy: 'internal_knowledge_core_only',
        web_discovery: 'disabled'
      }
    });
  } catch (error) {
    return Response.json({
      error: error?.message || String(error),
      meta: { api_version: INDUSTRIALPEDIA_API_VERSION, providers: [] }
    }, { status: 500 });
  }
}
