// Industrialpedia — registro único de endpoints externos.
// Regla: los consumidores importan estos contratos; no escriben versiones a mano.
// Cambiar un endpoint requiere actualizar este registro y ejecutar governance:gate.

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://stwwywzuzbkyoecjujeh.supabase.co';

export const INDUSTRIALPEDIA_ENDPOINTS = Object.freeze({
  search: Object.freeze({ name: 'industrialpedia-search-v17', status: 'canonical' }),
  catalogStats: Object.freeze({ name: 'industrialpedia-catalog-stats', status: 'canonical' }),
  structuredAcquisition: Object.freeze({ name: 'industrialpedia-structured-acquisition-v1', status: 'canonical' })
});

export function supabaseFunctionUrl(key) {
  const endpoint = INDUSTRIALPEDIA_ENDPOINTS[key];
  if (!endpoint) throw new Error(`Unknown Industrialpedia endpoint: ${key}`);
  return `${SUPABASE_URL}/functions/v1/${endpoint.name}`;
}

export const SEARCH_FUNCTION_NAME = INDUSTRIALPEDIA_ENDPOINTS.search.name;
export const SEARCH_FUNCTION_URL = supabaseFunctionUrl('search');
export const CATALOG_STATS_FUNCTION_URL = supabaseFunctionUrl('catalogStats');
export const STRUCTURED_ACQUISITION_FUNCTION_URL = supabaseFunctionUrl('structuredAcquisition');
