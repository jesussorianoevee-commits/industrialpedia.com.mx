const SUPABASE_URL = 'https://stwwywzuzbkyoecjujeh.supabase.co';
// Publishable/anon key: safe for client applications. Never use the service-role key here.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8K6JjRS7ga1H5jfmVCqQrA_V6ZvT3r_';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/industrialpedia-search-v17`;

async function call(params) {
  const url = new URL(FUNCTION_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      Accept: 'application/json'
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Industrialpedia API HTTP ${response.status}`);
  }
  return data;
}

export async function searchIndustrialpedia(q, limit = 25, manufacturer = '') {
  return call({ q, limit, manufacturer });
}

export async function getIndustrialpediaCatalogStats() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/industrialpedia-catalog-stats`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      Accept: 'application/json'
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Industrialpedia catalog stats HTTP ${response.status}`);
  return data;
}

export async function getPartIndustrialpedia(id) {
  // La ficha usa el mismo contrato canónico de Industrialpedia Search.
  // Evitamos el RPC legacy get_part_v1 porque no garantiza el payload técnico.
  const url = new URL(FUNCTION_URL);
  url.searchParams.set('mode', 'part');
  url.searchParams.set('id', id);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      Accept: 'application/json'
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.found || !data?.part) {
    throw new Error(data?.error || `Industrialpedia API HTTP ${response.status}`);
  }
  const part = data.part;
  if (part && typeof part === 'object') {
    data.part = {
      ...part,
      image_url: part.image_url || part.image?.image_url || part.image?.url || part.primary_image_url || '',
      image_verification_status: part.image_verification_status || part.image?.verification_status || null
    };
  }
  return data;
}

export async function compareIndustrialpedia(partId, partNumber = '', limit = 3) {
  // El comparador consume el Knowledge Core directamente. Base44 no debe ser
  // un proxy de una operación que ya está disponible en Supabase; además esto
  // evita que un fallo de routing/despliegue de una función Base44 convierta una
  // comparación válida en un HTTP 500.
  let canonicalId = String(partId || '').trim();
  const pn = String(partNumber || '').trim();

  if (pn) {
    const search = await searchIndustrialpedia(pn, 10);
    const results = Array.isArray(search?.results) ? search.results : [];
    const exact = results.find((r) => String(r.part_number || '').trim().toLowerCase() === pn.toLowerCase());
    if (!exact?.part_id) throw new Error(`No se encontró el número de parte ${pn} en Knowledge Core.`);
    canonicalId = exact.part_id;
  }

  if (!canonicalId) throw new Error('No se recibió un identificador canónico del componente.');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/compare_part_candidates_public_v1`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ p_part_id: canonicalId, p_limit: Math.min(Number(limit) || 3, 10) })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.message || data?.error || `Knowledge Core comparison HTTP ${response.status}`);
  }
  if (data.status === 'error') throw new Error(data.code || 'comparison_error');

  const specsToArray = (specifications) => {
    if (!specifications || typeof specifications !== 'object' || Array.isArray(specifications)) return [];
    return Object.entries(specifications).map(([attribute_name, raw]) => {
      const objectValue = raw && typeof raw === 'object' && !Array.isArray(raw);
      return {
        id: attribute_name,
        attribute_name,
        attribute_canonical: attribute_name,
        original_value: objectValue ? (raw.value ?? null) : raw,
        original_unit: objectValue ? (raw.unit ?? null) : null,
        normalized_value: objectValue ? (raw.value ?? null) : raw,
        normalized_unit: objectValue ? (raw.unit ?? null) : null
      };
    }).filter((s) => s.original_value !== null && s.original_value !== undefined && s.original_value !== '');
  };

  const baseRaw = data.base || {};
  const base = {
    id: baseRaw.id,
    part_number: baseRaw.part_number,
    manufacturer_name: baseRaw.manufacturer_name || '',
    category: baseRaw.category || '',
    description: baseRaw.description || baseRaw.name || '',
    specs: specsToArray(baseRaw.specifications),
    image_url: baseRaw.image?.image_url || ''
  };

  if (data.evaluable === false) {
    return {
      base,
      compatibility_evaluable: false,
      candidates_found: 0,
      candidates_considered: 0,
      alternatives: [],
      decision: { state: 'not_evaluable', message: 'Compatibilidad no evaluable: faltan especificaciones técnicas o familia técnica.' }
    };
  }

  const alternatives = (data.alternatives || []).map((a) => ({
    id: a.id,
    part_number: a.part_number,
    manufacturer_name: a.manufacturer_name || '',
    product_name: a.name || a.description || a.part_number,
    category: a.category || '',
    description: a.description || '',
    image_url: a.image?.image_url || '',
    status: a.status,
    source: { url: a.source_url || '', domain: a.source_url || '' },
    specs: specsToArray(a.specifications),
    comparison: a.comparison || { state: 'insufficient', equal: 0, different: 0, missing: 0, not_comparable: 0 }
  }));

  // La selección de candidatos y la matriz técnica son responsabilidades distintas.
  // v2 encuentra candidatos; compare_parts_v1 produce la comparación propiedad por propiedad.
  // Se ejecuta en un único RPC batch para evitar N llamadas HTTP desde el cliente.
  const candidateIds = alternatives.map((alt) => alt.id).filter(Boolean);
  const batchResponse = candidateIds.length ? await fetch(`${SUPABASE_URL}/rest/v1/rpc/compare_parts_batch_public_v1`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ p_part_a: canonicalId, p_part_b_ids: candidateIds })
  }) : null;
  const batchData = batchResponse ? await batchResponse.json().catch(() => null) : { comparisons: {} };
  if (batchResponse && (!batchResponse.ok || batchData?.status === 'error')) {
    throw new Error(batchData?.message || batchData?.error || `Knowledge Core batch comparison HTTP ${batchResponse.status}`);
  }
  const matrices = batchData?.comparisons || {};

  const enrichedAlternatives = alternatives.map((alt) => {
    const matrix = matrices[String(alt.id)] || null;
    if (!matrix || matrix.status === 'error') return alt;
    const rows = Array.isArray(matrix.comparisons) ? matrix.comparisons : [];
    const differences = rows.map((row) => ({
      attribute_name: row.property,
      attribute_canonical: row.property,
      base: row.part_a ?? null,
      candidate: row.part_b ?? null,
      state: row.comparison,
      reason: row.reason,
      comparable: row.comparable,
      normalized_a: row.normalized_a ?? null,
      normalized_b: row.normalized_b ?? null,
      normalized_unit: row.normalized_unit ?? null,
      normalized_components_a: row.normalized_a ?? null,
      normalized_components_b: row.normalized_b ?? null,
      source_property_a: row.source_property_a ?? row.property,
      source_property_b: row.source_property_b ?? row.property
    }));
    const counts = rows.reduce((acc, row) => {
      if (row.comparison === 'equal') acc.equal++;
      else if (row.comparison === 'different') acc.different++;
      else if (row.comparison === 'base_only') acc.missing++;
      else if (row.comparison === 'candidate_only') acc.candidate_only++;
      else if (row.comparison === 'not_comparable') acc.not_comparable++;
      return acc;
    }, { equal: 0, different: 0, missing: 0, candidate_only: 0, not_comparable: 0 });
    return {
      ...alt,
      comparison: {
        ...(alt.comparison || {}),
        ...counts,
        compared: rows.length,
        differences,
        matrix_status: matrix.status,
        comparison_mode: matrix.comparison_mode || 'technical_matrix',
        manufacturer_independent: matrix.manufacturer_independent === true
      }
    };
  });

  const compatible = enrichedAlternatives.some((a) => a.comparison.state === 'compatible');
  const decision = enrichedAlternatives.length === 0
    ? { state: 'insufficient', message: 'No se encontraron alternativas con datos técnicos comparables.' }
    : compatible
      ? { state: 'compatible_found', message: 'Se encontraron alternativas que cumplen las reglas de compatibilidad disponibles.' }
      : { state: 'review_required', message: 'Se encontraron candidatos, pero la evidencia disponible no permite declarar intercambiabilidad.' };

  return {
    base,
    candidates_found: enrichedAlternatives.length,
    candidates_considered: data.candidates_considered || enrichedAlternatives.length,
    alternatives: enrichedAlternatives,
    compatibility_evaluable: true,
    decision,
    source: 'Knowledge Core / compare_part_candidates_public_v1'
  };
}

const VERIFIED_CATEGORY_STATS_FALLBACK = {
  neumatica: 13,
  sensores: 181,
  robotica: 2,
  'electronica-control': 13,
  'mecanica-transmision': 68,
  'fuera-alcance': 79,
  'infraestructura-almacenamiento': 1287,
  'limpieza-epp': 527,
  'instrumentacion-medicion': 281,
  'laboratorio-cientifico': 3827,
  'fluidos-bombeo': 292,
  'herramientas-mro': 340,
  'soldadura-union': 101,
  'consumibles-mro': 312,
  'proceso-maquinaria': 6,
  'otros-mro': 325,
  sin_clasificar: 0,
  'otras-refacciones': 0
};

let categoryStatsCache = {
  value: VERIFIED_CATEGORY_STATS_FALLBACK,
  expiresAt: 0,
  refreshPromise: null
};

async function refreshIndustrialpediaCategoryStats() {
  const areas = [
    'neumatica', 'sensores', 'robotica', 'electronica-control', 'mecanica-transmision',
    'fuera-alcance', 'infraestructura-almacenamiento', 'limpieza-epp',
    'instrumentacion-medicion', 'laboratorio-cientifico', 'fluidos-bombeo',
    'herramientas-mro', 'soldadura-union', 'consumibles-mro', 'proceso-maquinaria',
    'otros-mro'
  ];

  // Estas consultas son costosas en el RPC actual; secuenciarlas evita que
  // dieciséis llamadas simultáneas provoquen statement_timeout en PostgREST.
  const next = { sin_clasificar: 0, 'otras-refacciones': 0 };
  for (const area of areas) {
    try {
      const result = await getIndustrialpediaAreaParts(area, 1, 0);
      next[area] = Number(result?.total) || 0;
    } catch {
      // Conservamos el último valor conocido para esta área.
      next[area] = Number(categoryStatsCache.value?.[area]) || 0;
    }
  }

  categoryStatsCache = {
    value: next,
    expiresAt: Date.now() + 5 * 60 * 1000,
    refreshPromise: null
  };
  return next;
}

export async function getIndustrialpediaCategoryStats() {
  const now = Date.now();
  if (categoryStatsCache.expiresAt > now) return categoryStatsCache.value;

  // Stale-while-revalidate: la UI recibe inmediatamente el último estado
  // válido y la actualización pesada se ejecuta una sola vez en segundo plano.
  if (!categoryStatsCache.refreshPromise) {
    categoryStatsCache.refreshPromise = refreshIndustrialpediaCategoryStats().catch(() => {
      categoryStatsCache.refreshPromise = null;
      return categoryStatsCache.value;
    });
  }
  return categoryStatsCache.value;
}

export async function getIndustrialpediaAreaParts(area, limit = 25, offset = 0) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/industrialpedia_catalog_area_parts_v2`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ p_area: area, p_limit: Math.min(Number(limit) || 25, 50), p_offset: Math.max(Number(offset) || 0, 0) })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data)) {
    throw new Error(data?.message || data?.error || `Catalog area parts HTTP ${response.status}`);
  }
  return {
    results: data.map((r) => ({
      id: r.part_id,
      part_number: r.part_number || '',
      manufacturer_name: r.manufacturer || '',
      category: r.category || '',
      description: r.description || r.name || '',
      title: r.name || r.part_number || '',
      specifications: r.specifications && typeof r.specifications === 'object' ? r.specifications : {},
      validation_state: r.status === 'verified' ? 'published' : r.status || 'incomplete',
      match: 'category',
      has_evidence: Number(r.evidence_count || 0) > 0,
      evidence_count: Number(r.evidence_count || 0),
      spec_count: r.specifications ? Object.keys(r.specifications).length : 0,
      image_url: r.image_url || r.image?.image_url || r.image?.url || r.primary_image_url || '',
      image_verification_status: r.image_verification_status || r.image?.verification_status || null,
      image_source: r.image_source || r.image?.source_url || r.image?.source || null,
      image_is_primary: r.image_is_primary === true || r.image?.is_primary === true,
      source_ids: Array.isArray(r.source_ids) ? r.source_ids.filter(Boolean) : [],
      discovery_state: null,
      source_url: r.source_url || null,
      document_url: null,
      top_specs: r.specifications ? Object.entries(r.specifications).slice(0, 6).map(([attribute, value]) => ({
        attribute,
        value: typeof value === 'object' && value !== null ? value.value ?? value : value,
        unit: typeof value === 'object' && value !== null ? value.unit ?? null : null,
        validated: true
      })) : [],
      api_match_type: 'category',
      api_score: 0
    })),
    total: Number(data[0]?.result_count || 0)
  };
}

export async function compareReferenceIndustrialpedia({ manufacturer = '', partNumber = '', category = '', specifications = {}, limit = 5 }) {
  const data = await call({
    mode: 'reference_compare',
    manufacturer,
    part_number: partNumber,
    category,
    specifications: JSON.stringify(specifications),
    limit
  });
  return data;
}

export async function decideIndustrialpedia(family, requirements, limit = 10) {
  return call({ mode: 'decide', family, requirements: JSON.stringify(requirements), limit });
}

export const INDUSTRIALPEDIA_API_VERSION = 'v8-frozen';
