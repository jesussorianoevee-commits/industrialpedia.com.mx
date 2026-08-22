import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SUPABASE_URL = 'https://stwwywzuzbkyoecjujeh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8K6JjRS7ga1H5jfmVCqQrA_V6ZvT3r_';
const RPC_URL = `${SUPABASE_URL}/rest/v1/rpc/compare_part_candidates_public_v1`;
const SEARCH_URL = `${SUPABASE_URL}/functions/v1/industrialpedia-search`;

function specsToArray(specifications: any) {
  if (!specifications || typeof specifications !== 'object' || Array.isArray(specifications)) return [];
  return Object.entries(specifications).map(([attribute_name, raw]: any) => {
    const objectValue = raw && typeof raw === 'object' && !Array.isArray(raw);
    return {
      id: `${attribute_name}`,
      attribute_name,
      attribute_canonical: attribute_name,
      original_value: objectValue ? (raw.value ?? null) : raw,
      original_unit: objectValue ? (raw.unit ?? null) : null,
      normalized_value: objectValue ? (raw.value ?? null) : raw,
      normalized_unit: objectValue ? (raw.unit ?? null) : null
    };
  }).filter((s: any) => s.original_value !== null && s.original_value !== undefined && s.original_value !== '');
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let partId = String(body.part_id || '').trim();
    const partNumber = String(body.part_number || '').trim();
    if (!partId && !partNumber) return Response.json({ error: 'part_id or part_number required' }, { status: 400 });

    // La URL de la ficha puede contener un ID de la capa Base44, no el UUID
    // canónico de Supabase. Si tenemos número de parte, resolvemos SIEMPRE por
    // la API canónica de Industrialpedia, que devuelve part_id sin depender de RLS.
    if (partNumber) {
      const searchUrl = new URL(SEARCH_URL);
      searchUrl.searchParams.set('q', partNumber);
      searchUrl.searchParams.set('limit', '10');
      const searchResponse = await fetch(searchUrl.toString(), {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, Accept: 'application/json' }
      });
      const searchData = await searchResponse.json().catch(() => null);
      if (!searchResponse.ok) {
        return Response.json({ error: 'part_resolution_failed', detail: searchData?.error || `HTTP ${searchResponse.status}` }, { status: 502 });
      }
      const results = Array.isArray(searchData?.results) ? searchData.results : [];
      const exact = results.find((r: any) => String(r.part_number || '').trim().toLowerCase() === partNumber.toLowerCase());
      const resolved = exact || results.find((r: any) => String(r.part_id || '') === partId);
      if (!resolved?.part_id) {
        return Response.json({ error: 'part_not_found', part_number: partNumber }, { status: 404 });
      }
      partId = String(resolved.part_id);
    }
    if (!partId) return Response.json({ error: 'canonical_part_id_required' }, { status: 400 });

    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ p_part_id: partId, p_limit: 3 })
    });

    const rpc = await response.json().catch(() => null);
    if (!response.ok || !rpc) {
      return Response.json({ error: rpc?.message || rpc?.error || `Comparison API HTTP ${response.status}` }, { status: response.status || 502 });
    }
    if (rpc.status === 'error') return Response.json({ error: rpc.code || 'comparison_error' }, { status: 404 });

    const baseRaw = rpc.base || {};
    const base = {
      id: baseRaw.id,
      part_number: baseRaw.part_number,
      manufacturer_name: baseRaw.manufacturer_name || '',
      category: baseRaw.category || '',
      description: baseRaw.description || baseRaw.name || '',
      specs: specsToArray(baseRaw.specifications),
      image_url: ''
    };

    if (rpc.evaluable === false) {
      return Response.json({
        base,
        compatibility_evaluable: false,
        reason: 'La ficha base no tiene especificaciones técnicas disponibles en el Knowledge Core.',
        candidates_found: 0,
        candidates_considered: 0,
        alternatives: [],
        decision: { state: 'not_evaluable', message: 'Compatibilidad no evaluable: faltan especificaciones técnicas.' }
      });
    }

    const alternatives = (rpc.alternatives || []).map((a: any) => ({
      id: a.id,
      part_number: a.part_number,
      manufacturer_name: a.manufacturer_name || '',
      product_name: a.name || a.description || a.part_number,
      category: a.category || '',
      description: a.description || '',
      image_url: '',
      status: a.status,
      source: { url: a.source_url || '', domain: a.source_url || '' },
      specs: specsToArray(a.specifications),
      comparison: a.comparison || { state: 'insufficient', equal: 0, different: 0, missing: 0, not_comparable: 0 }
    }));

    const compatible = alternatives.some((a: any) => a.comparison.state === 'compatible');
    const decision = alternatives.length === 0
      ? { state: 'insufficient', message: 'No se encontraron alternativas con datos técnicos comparables.' }
      : compatible
        ? { state: 'compatible_found', message: 'Se encontraron alternativas que coinciden con los atributos técnicos disponibles.' }
        : { state: 'review_required', message: 'Se encontraron candidatos, pero existen diferencias o datos faltantes que requieren revisión técnica.' };

    return Response.json({
      base,
      candidates_found: alternatives.length,
      candidates_considered: rpc.candidates_considered || alternatives.length,
      alternatives,
      compatibility_evaluable: true,
      decision,
      source: 'Knowledge Core / compare_part_candidates_public_v1'
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}