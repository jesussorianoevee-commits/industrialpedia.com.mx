import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { searchIndustrialpedia, INDUSTRIALPEDIA_API_VERSION } from '../../shared/supabaseIndustrialpediaApi.js';

function mapSupabaseResult(r: any) {
  return {
    id: r.part_id || null,
    part_number: r.part_number || '',
    manufacturer_name: r.manufacturer || '',
    category: r.category || '',
    description: r.description || r.name || '',
    title: r.name || r.part_number || '',
    image_url: '',
    validation_state: r.status === 'verified' ? 'published' : r.status || 'incomplete',
    match: r.match_type || 'candidate',
    has_evidence: false,
    evidence_count: 0,
    spec_count: r.specifications ? Object.keys(r.specifications).length : 0,
    source_ids: [],
    discovery_state: null,
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
        providers: ['supabase_knowledge_core', 'web_discovery'],
        source_policy: null,
        web_discovery: 'frozen_legacy'
      }
    });
  } catch (error) {
    return Response.json({
      error: error?.message || String(error),
      meta: { api_version: INDUSTRIALPEDIA_API_VERSION, providers: [] }
    }, { status: 500 });
  }
}
