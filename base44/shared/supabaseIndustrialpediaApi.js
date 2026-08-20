const SUPABASE_URL = 'https://stwwywzuzbkyoecjujeh.supabase.co';
// Publishable/anon key: safe for client applications. Never use the service-role key here.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8K6JjRS7ga1H5jfmVCqQrA_V6ZvT3r_';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/industrialpedia-search`;

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

export async function getPartIndustrialpedia(id) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_part_v1`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ p_part_id: id })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.message || `Industrialpedia API HTTP ${response.status}`);
  return { api_version: 'v1', operation: 'part', part: data };
}

export async function decideIndustrialpedia(family, requirements, limit = 10) {
  return call({ mode: 'decide', family, requirements: JSON.stringify(requirements), limit });
}

export const INDUSTRIALPEDIA_API_VERSION = 'v8-frozen';
