import {
  CATALOG_STATS_FUNCTION_URL,
  SEARCH_FUNCTION_URL,
  SUPABASE_URL
} from './endpointRegistry.js';

// Publishable/anon key: safe for client applications. Never use the service-role key here.
const SUPABASE_PUBLISHABLE_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_8K6JjRS7ga1H5jfmVCqQrA_V6ZvT3r_';
const FUNCTION_URL = SEARCH_FUNCTION_URL;
import { resolveCrossReference } from './crossReferenceEngine.js';

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
  // Contrato canónico v17 primero. Si el gateway de Edge falla o devuelve un
  // conjunto vacío, hacemos recuperación determinística contra el mismo RPC
  // canónico v4. No ampliamos el universo, no quitamos filtros y no inventamos
  // resultados: ambos caminos consultan el mismo Knowledge Core.
  try {
    const primary = await call({ q, limit, manufacturer });
    if (Array.isArray(primary?.results) && primary.results.length > 0) return primary;

    const fallbackResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/industrialpedia_search_v4`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ search_query: q, result_limit: Math.min(Number(limit) || 25, 50), manufacturer_query: manufacturer || null })
    });
    const fallback = await fallbackResponse.json().catch(() => null);
    if (fallbackResponse.ok && Array.isArray(fallback)) {
      return {
        api_version: 'v4-fallback',
        query: q,
        count: fallback.length,
        results: fallback,
        recovered_from_empty_gateway: true
      };
    }
    return primary;
  } catch (primaryError) {
    const fallbackResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/industrialpedia_search_v4`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ search_query: q, result_limit: Math.min(Number(limit) || 25, 50), manufacturer_query: manufacturer || null })
    });
    const fallback = await fallbackResponse.json().catch(() => null);
    if (fallbackResponse.ok && Array.isArray(fallback)) {
      return {
        api_version: 'v4-fallback',
        query: q,
        count: fallback.length,
        results: fallback,
        recovered_from_gateway_error: true
      };
    }
    throw primaryError;
  }
}

export async function getIndustrialpediaCatalogStats() {
  const response = await fetch(CATALOG_STATS_FUNCTION_URL, {
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

async function getCrossReferenceRules(familyCode) {
  const family = String(familyCode || '').trim();
  if (!family) return [];
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cross_reference_rules_public_v1`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ p_family_code: family })
    });
    if (!response.ok) return [];
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function getCrossReferenceGovernance(familyCode) {
  const family = String(familyCode || '').trim();
  if (!family) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cross_reference_family_governance_public_v1`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ p_family_code: family })
    });
    if (!response.ok) return null;
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

function mapCrossReferenceState(state) {
  switch (state) {
    case 'EXACT':
    case 'REPLACE':
    case 'EQUIVALENT':
    case 'COMPATIBLE':
      return 'compatible';
    case 'NOT_SUBSTITUTABLE':
      return 'not_compatible';
    case 'INSUFFICIENT_EVIDENCE':
      return 'insufficient';
    case 'SIMILAR_REVIEW':
    default:
      return 'review';
  }
}

function specsToArrayWithLabels(specifications, displayNameMap) {
  if (!specifications || typeof specifications !== 'object' || Array.isArray(specifications)) return [];
  return Object.entries(specifications).map(([attribute_name, raw]) => {
    const objectValue = raw && typeof raw === 'object' && !Array.isArray(raw);
    const formalLabel = (displayNameMap || {})[attribute_name] || null;
    return {
      id: attribute_name,
      attribute_name,
      attribute_canonical: formalLabel || attribute_name,
      has_formal_label: Boolean(formalLabel),
      original_value: objectValue ? (raw.value ?? null) : raw,
      original_unit: objectValue ? (raw.unit ?? null) : null,
      normalized_value: objectValue ? (raw.value ?? null) : raw,
      normalized_unit: objectValue ? (raw.unit ?? null) : null
    };
  }).filter((s) => s.original_value !== null && s.original_value !== undefined && s.original_value !== '');
}

async function fetchPropertyDisplayNames(specsList) {
  const allPropertyCodes = new Set();
  specsList.forEach((specs) => {
    if (specs && typeof specs === 'object' && !Array.isArray(specs)) Object.keys(specs).forEach((k) => allPropertyCodes.add(k));
  });
  if (allPropertyCodes.size === 0) return {};
  try {
    const codesList = [...allPropertyCodes];
    const labelsResponse = await fetch(`${SEARCH_FUNCTION_URL}?mode=property_labels&codes=${encodeURIComponent(codesList.join(','))}`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
    const labelsData = await labelsResponse.json().catch(() => null);
    return labelsData?.labels && typeof labelsData.labels === 'object' ? labelsData.labels : {};
  } catch {
    return {};
  }
}

// Comparación técnica de piezas elegidas a mano por el usuario (bandeja de
// comparación), a diferencia de compareIndustrialpedia que parte de un
// componente base y deja que compare_part_candidates_v2 descubra
// alternativas por familia/categoría. Aquí no hay descubrimiento ni
// gobernanza de familia que aplicar -- el usuario ya decidió qué comparar --
// así que se reutiliza directamente compare_parts_batch_public_v1 (la misma
// matriz técnica propiedad-por-propiedad que alimenta la tabla de Comparar)
// contra la primera pieza seleccionada como referencia.
export async function compareSelectedParts(partIds) {
  const ids = Array.from(new Set((partIds || []).map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 4);
  if (ids.length < 2) throw new Error('Selecciona al menos 2 refacciones para comparar.');

  const fetched = await Promise.all(ids.map((id) => getPartIndustrialpedia(id).catch(() => null)));
  const parts = fetched.map((r) => r?.part).filter(Boolean);
  if (parts.length < 2) throw new Error('No se pudieron cargar las refacciones seleccionadas.');

  const [baseRaw, ...candidateRawList] = parts;
  const displayNameMap = await fetchPropertyDisplayNames([baseRaw.specifications, ...candidateRawList.map((c) => c.specifications)]);
  const specsToArray = (specifications) => specsToArrayWithLabels(specifications, displayNameMap);

  const base = {
    id: baseRaw.id,
    part_number: baseRaw.part_number,
    manufacturer_name: baseRaw.manufacturer_name || '',
    category: baseRaw.category || '',
    description: baseRaw.description || baseRaw.name || '',
    source: { url: baseRaw.source_url || baseRaw.source?.url || '', domain: baseRaw.source_url || baseRaw.source?.url || '' },
    specs: specsToArray(baseRaw.specifications),
    image_url: baseRaw.image_url || baseRaw.image?.image_url || baseRaw.image?.url || baseRaw.primary_image_url || ''
  };

  const candidateIds = candidateRawList.map((c) => c.id).filter(Boolean);
  const batchResponse = candidateIds.length ? await fetch(`${SUPABASE_URL}/rest/v1/rpc/compare_parts_batch_public_v1`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p_part_a: base.id, p_part_b_ids: candidateIds })
  }) : null;
  const batchData = batchResponse ? await batchResponse.json().catch(() => null) : { comparisons: {} };
  if (batchResponse && (!batchResponse.ok || batchData?.status === 'error')) {
    throw new Error(batchData?.message || batchData?.error || `Knowledge Core batch comparison HTTP ${batchResponse.status}`);
  }
  const matrices = batchData?.comparisons || {};

  const alternatives = candidateRawList.map((a) => {
    const matrix = matrices[String(a.id)] || null;
    const rows = matrix && matrix.status !== 'error' && Array.isArray(matrix.comparisons) ? matrix.comparisons : [];
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
      normalized_unit: row.normalized_unit ?? null
    }));
    const counts = rows.reduce((acc, row) => {
      if (row.comparison === 'equal') acc.equal++;
      else if (row.comparison === 'different') acc.different++;
      else if (row.comparison === 'base_only') acc.missing++;
      else if (row.comparison === 'candidate_only') acc.candidate_only++;
      else if (row.comparison === 'not_comparable') acc.not_comparable++;
      return acc;
    }, { equal: 0, different: 0, missing: 0, candidate_only: 0, not_comparable: 0 });
    // Sin reglas de familia (critical/required) que aplicar aquí -- el estado
    // se deriva directamente de la matriz técnica: cualquier discrepancia
    // real manda a revisión, nunca se declara "compatible" solo por default.
    const state = counts.different > 0
      ? 'review'
      : (rows.length > 0 && counts.equal > 0 && counts.not_comparable === 0 && counts.missing === 0)
        ? 'compatible'
        : rows.length > 0 ? 'review' : 'insufficient';
    return {
      id: a.id,
      part_number: a.part_number,
      manufacturer_name: a.manufacturer_name || '',
      product_name: a.name || a.description || a.part_number,
      category: a.category || '',
      description: a.description || '',
      image_url: a.image_url || a.image?.image_url || a.image?.url || a.primary_image_url || '',
      status: a.status,
      source: { url: a.source_url || '', domain: a.source_url || '' },
      specs: specsToArray(a.specifications),
      comparison: { state, ...counts, compared: rows.length, differences, matrix_status: matrix?.status || null, comparison_mode: matrix?.comparison_mode || 'technical_matrix' }
    };
  });

  return {
    base,
    candidates_found: alternatives.length,
    candidates_considered: alternatives.length,
    alternatives,
    compatibility_evaluable: true,
    decision: {
      state: alternatives.some((a) => a.comparison.state === 'compatible') ? 'compatible_found' : 'review_required',
      message: ''
    },
    source: 'Knowledge Core / selección manual'
  };
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

  // Los nombres reales (display_name_es) viven en spec_property_definitions,
  // fuente unica de verdad -- igual que en la ficha de producto. Sin esto,
  // el comparador tenia que adivinar localmente y mezclaba espanol/ingles
  // palabra por palabra (ej. "potencia loss", "supply voltaje max").
  const allPropertyCodes = new Set();
  const collectCodes = (specs) => {
    if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
      Object.keys(specs).forEach((k) => allPropertyCodes.add(k));
    }
  };
  collectCodes(data.base?.specifications);
  (data.alternatives || []).forEach((alt) => collectCodes(alt?.specifications));

  let displayNameMap = {};
  if (allPropertyCodes.size > 0) {
    try {
      // No se consulta la tabla directo con la llave publica -- RLS no tiene
      // politica de lectura anonima para spec_property_definitions (el
      // proyecto expone datos solo via Edge Functions con service_role, no
      // acceso REST directo a tablas). Se usa mode=property_labels de
      // search-v17, mismo patron que ya usa el resto de la app.
      const codesList = [...allPropertyCodes];
      const labelsResponse = await fetch(
        `${SEARCH_FUNCTION_URL}?mode=property_labels&codes=${encodeURIComponent(codesList.join(','))}`,
        { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } }
      );
      const labelsData = await labelsResponse.json().catch(() => null);
      if (labelsData?.labels && typeof labelsData.labels === 'object') {
        displayNameMap = labelsData.labels;
      }
    } catch {
      // Si falla la consulta de nombres, seguimos con el fallback local --
      // nunca bloqueamos la comparacion por esto.
    }
  }

  const specsToArray = (specifications) => specsToArrayWithLabels(specifications, displayNameMap);

  const baseRaw = data.base || {};
  const base = {
    id: baseRaw.id,
    part_number: baseRaw.part_number,
    manufacturer_name: baseRaw.manufacturer_name || '',
    category: baseRaw.category || '',
    description: baseRaw.description || baseRaw.name || '',
    // El comparador también necesita la procedencia de la pieza base. Cuando
    // image_url no viene materializado, el mismo resolver determinístico del
    // catálogo puede usar source_url como evidencia exacta para localizar la
    // imagen, en lugar de intentar una búsqueda ciega solo por número de parte.
    source: { url: baseRaw.source_url || baseRaw.source?.url || '', domain: baseRaw.source_url || baseRaw.source?.url || '' },
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

  const crossReferenceRules = await getCrossReferenceRules(baseRaw.category || '');
  const crossReferenceGovernance = await getCrossReferenceGovernance(baseRaw.category || '');
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
    // Conservados para el motor de cross-reference (ver enrichedAlternatives más abajo).
    // No se usan para la tabla de specs visible -- eso sigue viniendo de la matriz batch.
    evidence: Array.isArray(a.evidence) ? a.evidence : [],
    relations: Array.isArray(a.relations) ? a.relations : [],
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
    // El motor de cross-reference (reglas critical/required) debe comparar valores
    // en la MISMA unidad. Antes se le pasaban las specifications crudas del
    // candidato, pero ese objeto nunca se propagaba hasta aquí (siempre quedaba
    // {}), así que cualquier familia con una regla critical marcaba
    // NOT_SUBSTITUTABLE sin importar los datos reales -- y aun corregido eso,
    // comparar valores crudos sin unidad (ej. "5 bar" vs "72.5 psi") habría sido
    // incorrecto. En vez de mantener un segundo camino de normalización, se
    // reusa normalized_a/normalized_b de la misma matriz que ya alimenta la
    // tabla de specs visible -- una sola fuente de verdad, ya en la misma unidad.
    // row.normalized_a/normalized_b son arrays de "niveles" (uno por rango
    // min/max) tal como los produce compare_parts_v1, no un valor escalar --
    // pasar el array tal cual a evaluateRule() (crossReferenceEngine.js) hacía
    // que numeric()/valuesEqual() no reconocieran ningún valor, así que TODA
    // regla critical/required de una familia con dimensiones (bore_diameter,
    // outside_diameter, width, etc.) caía en not_comparable y el candidato
    // quedaba en "Datos insuficientes" aunque la ficha técnica mostrara los
    // mismos valores como coincidentes. Se extrae aquí el valor normalizado
    // escalar (magnitud + unidad canónica) antes de entregarlo al motor.
    const scalarFromLevels = (levels) => {
      if (!Array.isArray(levels) || levels.length === 0) return null;
      const level = levels.find((l) => l?.normalization_status === 'normalized' && l?.normalized_value !== null && l?.normalized_value !== undefined)
        || levels.find((l) => l?.parsed_value !== null && l?.parsed_value !== undefined);
      if (!level) return null;
      const value = level.normalized_value ?? level.parsed_value;
      const unit = level.normalized_unit || level.parsed_unit || '';
      return unit ? `${value} ${unit}` : String(value);
    };
    const normalizedSpecsA = {};
    const normalizedSpecsB = {};
    for (const row of rows) {
      if (!row.property) continue;
      const scalarA = scalarFromLevels(row.normalized_a);
      const scalarB = scalarFromLevels(row.normalized_b);
      if (scalarA !== null) normalizedSpecsA[row.property] = scalarA;
      if (scalarB !== null) normalizedSpecsB[row.property] = scalarB;
    }
    const technicalBase = {
      part_number: baseRaw.part_number,
      family_code: baseRaw.category,
      specifications: normalizedSpecsA
    };
    const technicalCandidate = {
      part_number: alt.part_number,
      family_code: baseRaw.category,
      specifications: normalizedSpecsB,
      evidence: alt.evidence || [],
      relations: alt.relations || []
    };
    const crossReference = (crossReferenceRules.length || crossReferenceGovernance)
      ? resolveCrossReference(technicalBase, technicalCandidate, crossReferenceRules, crossReferenceGovernance)
      : null;

    return {
      ...alt,
      comparison: {
        ...(alt.comparison || {}),
        ...counts,
        compared: rows.length,
        differences,
        matrix_status: matrix.status,
        comparison_mode: matrix.comparison_mode || 'technical_matrix',
        manufacturer_independent: matrix.manufacturer_independent === true,
        ...(crossReference ? {
          cross_reference_state: crossReference.state,
          cross_reference_relation: crossReference.relation,
          cross_reference_family_readiness: crossReference.family_readiness || null,
          cross_reference_governance_reason: crossReferenceGovernance?.reason || null,
          cross_reference_score: crossReference.score,
          cross_reference_reasons: crossReference.reasons,
          cross_reference_critical_fail: crossReference.critical_fail,
          cross_reference_critical_total: crossReference.critical_total,
          cross_reference_required_fail: crossReference.required_fail,
          cross_reference_required_total: crossReference.required_total,
          state: mapCrossReferenceState(crossReference.state)
        } : {})
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

export async function refreshIndustrialpediaCategoryStats() {
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
  // Los conteos por área no forman parte del camino crítico de navegación.
  // No ejecutamos desde el cliente el RPC que clasifica todo `parts`, porque
  // una consulta cosmética de Home no debe competir con Buscar/área.
  // Sólo devolvemos el snapshot ya disponible; otra rutina explícita puede
  // actualizarlo cuando corresponda.
  const snapshot = categoryStatsCache.value || {};
  const hasAnyCount = Object.values(snapshot).some((value) => Number(value) > 0);
  return hasAnyCount ? snapshot : {};
}

export async function getIndustrialpediaAreaParts(area, limit = 20, offset = 0) {
  const response = await fetch(`${SEARCH_FUNCTION_URL}?mode=area&area=${encodeURIComponent(String(area || '').trim())}&limit=${Math.min(Number(limit) || 20, 20)}&offset=${Math.max(Number(offset) || 0, 0)}`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      Accept: 'application/json'
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== 'object' || !Array.isArray(data.results)) {
    throw new Error(data?.message || data?.error || `Catalog browse HTTP ${response.status}`);
  }
  return {
    results: data.results.map((r) => ({
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
      api_score: 0,
      defer_image_lookup: r.defer_image_lookup === true
    })),
    total: null,
    has_more: data.has_more === true,
    page_size: Number(data.page_size || limit || 20),
    offset: Number(data.offset || 0),
    area: data.area || area
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

// Navegacion por caso de uso -- validada con la investigacion de RoboDK/
// RoboMercato (metricas/criterios fijos por categoria). Deterministica: la
// lista de casos de uso vive en la tabla use_cases, poblada solo con
// familias que ya tienen piezas reales publicadas -- nunca una promesa
// vacia. Sin IA en ningun punto de este flujo.
export async function getUseCasesIndustrialpedia() {
  const data = await call({ mode: 'use_cases' });
  return Array.isArray(data?.use_cases) ? data.use_cases : [];
}

export async function browseByFamilyIndustrialpedia(familyCode, limit = 12) {
  const data = await call({ mode: 'browse', family: familyCode, limit });
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((r) => ({
    id: r.part_id,
    part_number: r.part_number || '',
    manufacturer_name: r.manufacturer || '',
    category: r.category || '',
    category_label: r.category_label || '',
    description: r.description || r.name || '',
    specifications: r.specifications && typeof r.specifications === 'object' ? r.specifications : {},
    image_url: r.image_url || '',
    image_verification_status: r.image_verification_status || null
  }));
}

export const INDUSTRIALPEDIA_API_VERSION = 'v8-frozen';
