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

export async function getPartIndustrialpedia(id, language = 'es') {
  // La ficha usa el mismo contrato canónico de Industrialpedia Search.
  // Evitamos el RPC legacy get_part_v1 porque no garantiza el payload técnico.
  // lang controla el idioma de specifications_labeled (nombres canónicos desde
  // spec_property_definitions), resuelto en el backend, fuente única de verdad.
  const url = new URL(FUNCTION_URL);
  url.searchParams.set('mode', 'part');
  url.searchParams.set('id', id);
  url.searchParams.set('lang', language);
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

  // Cuando la ruta ya trae el UUID canónico, no debemos volver a resolverlo
  // mediante búsqueda textual. La búsqueda pública puede no indexar todavía
  // una referencia aunque la pieza exista y sea perfectamente comparable.
  // El UUID de /comparar/:id es la fuente de verdad en este flujo.
  if (!canonicalId && pn) {
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
    image_url: baseRaw.image?.image_url || baseRaw.image?.url || baseRaw.image_url || baseRaw.primary_image_url || ''
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
    image_url: a.image?.image_url || a.image?.url || a.image_url || a.primary_image_url || '',
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

  // Quality gate del comparador: un candidato no puede mostrarse como alternativa
  // técnica si la matriz real encontró diferencias pero ninguna coincidencia.
  // Esto evita que un candidato seleccionado por familia/categoría aparezca como
  // "SIMILAR" cuando su comparación efectiva es 0/N.
  const visibleAlternatives = enrichedAlternatives.filter((alt) => {
    const comparison = alt.comparison || {};
    const hasMatrix = Boolean(comparison.matrix_status);
    const equal = Number(comparison.equal) || 0;
    const different = Number(comparison.different) || 0;
    const compared = Number(comparison.compared) || 0;

    if (hasMatrix && compared > 0 && equal === 0 && different > 0) return false;
    return true;
  });

  const compatible = visibleAlternatives.some((a) => a.comparison.state === 'compatible');
  const decision = visibleAlternatives.length === 0
    ? { state: 'insufficient', message: 'No se encontraron alternativas con evidencia técnica coincidente.' }
    : compatible
      ? { state: 'compatible_found', message: 'Se encontraron alternativas que cumplen las reglas de compatibilidad disponibles.' }
      : { state: 'review_required', message: 'Se encontraron candidatos con coincidencias técnicas, pero la evidencia disponible no permite declarar intercambiabilidad.' };

  return {
    base,
    candidates_found: visibleAlternatives.length,
    candidates_considered: data.candidates_considered || enrichedAlternatives.length,
    alternatives: visibleAlternatives,
    compatibility_evaluable: true,
    decision,
    source: 'Knowledge Core / compare_part_candidates_public_v1'
  };
}

const CATEGORY_AREAS = [
  'neumatica', 'sensores', 'robotica', 'electronica-control', 'mecanica-transmision',
  'fuera-alcance', 'infraestructura-almacenamiento', 'limpieza-epp',
  'instrumentacion-medicion', 'laboratorio-cientifico', 'fluidos-bombeo',
  'herramientas-mro', 'soldadura-union', 'consumibles-mro', 'proceso-maquinaria',
  'otros-mro'
];

// Fuente única de verdad para los conteos por área.
// No se conservan números hardcodeados: una cifra antigua no puede sobrevivir a
// un cambio de clasificador y contradecir la misma consulta que abre el área.
const EMPTY_CATEGORY_STATS = Object.fromEntries([
  ...CATEGORY_AREAS,
  'sin_clasificar',
  'otras-refacciones'
].map((area) => [area, 0]));

const CATEGORY_STATS_STORAGE_KEY = 'industrialpedia_category_stats_v6';

function readCategoryStatsSnapshot() {
  try {
    const raw = localStorage.getItem(CATEGORY_STATS_STORAGE_KEY);
    if (!raw) return { ...EMPTY_CATEGORY_STATS };
    const parsed = JSON.parse(raw);
    if (!parsed?.value || typeof parsed.value !== 'object') return { ...EMPTY_CATEGORY_STATS };
    return { ...EMPTY_CATEGORY_STATS, ...parsed.value };
  } catch {
    return { ...EMPTY_CATEGORY_STATS };
  }
}

let categoryStatsCache = {
  value: readCategoryStatsSnapshot(),
  expiresAt: 0,
  refreshPromise: null
};

function publishCategoryStats(value) {
  try {
    localStorage.setItem(CATEGORY_STATS_STORAGE_KEY, JSON.stringify({ value, savedAt: Date.now() }));
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('industrialpedia:category-stats-updated', { detail: value }));
  }
}

async function getIndustrialpediaCanonicalAreaStats() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/industrialpedia_catalog_area_stats_v1`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!response.ok) throw new Error(`category_area_stats_http_${response.status}`);
  const rows = await response.json();
  return Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [row.area, Number(row.count)]));
}

async function refreshIndustrialpediaCategoryStats() {
  // Un solo RPC canónico calcula todos los conteos con exactamente la misma
  // versión del clasificador que usa industrialpedia_catalog_area_parts_v2.
  const canonical = await getIndustrialpediaCanonicalAreaStats();
  const next = { ...EMPTY_CATEGORY_STATS, ...canonical };
  categoryStatsCache = {
    value: next,
    expiresAt: Date.now() + 5 * 60 * 1000,
    refreshPromise: null
  };
  publishCategoryStats(next);
  return next;
}

export async function getIndustrialpediaCategoryStats() {
  const now = Date.now();
  const snapshot = categoryStatsCache.value || { ...EMPTY_CATEGORY_STATS };

  if (!categoryStatsCache.refreshPromise && categoryStatsCache.expiresAt <= now) {
    categoryStatsCache.refreshPromise = refreshIndustrialpediaCategoryStats()
      .catch(() => snapshot)
      .finally(() => { categoryStatsCache.refreshPromise = null; });
  }

  // En un arranque sin snapshot no mostramos conteos inventados ni ceros
  // transitorios: esperamos la primera respuesta canónica. Con snapshot válido,
  // la UI permanece inmediata y la revalidación sigue en segundo plano.
  const hasAnyCount = Object.values(snapshot).some((value) => Number(value) > 0);
  if (!hasAnyCount && categoryStatsCache.refreshPromise) {
    return categoryStatsCache.refreshPromise;
  }

  return snapshot;
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
