import { base44 } from '@/api/base44Client';

export function normalizeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const decoded = raw.replace(/&amp;/gi, '&');
  try {
    const url = new URL(decoded);
    return /^https?:$/.test(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function cacheKey(partNumber, manufacturer) {
  const pn = String(partNumber || '').trim().toLowerCase();
  const mf = String(manufacturer || '').trim().toLowerCase();
  return `industrialpedia:image:v2:${mf}:${pn}`;
}

export async function resolveProductImage({ partNumber, manufacturer = '', sourceUrl = '', existingUrl = '' } = {}) {
  const existing = normalizeImageUrl(existingUrl);
  if (existing) return { image_url: existing, status: 'existing', verified: false };

  const exactPartNumber = String(partNumber || '').trim();
  const expectedManufacturer = String(manufacturer || '').trim();
  if (!exactPartNumber) return { image_url: '', status: 'not_found', verified: false };

  const key = cacheKey(exactPartNumber, expectedManufacturer);
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.image_url) return { ...parsed, image_url: normalizeImageUrl(parsed.image_url) };
      if (parsed?.status) return parsed;
    }
  } catch {}

  try {
    const response = await base44.functions.invoke('AdquirirImagenAPI', {
      part_number: exactPartNumber,
      manufacturer_hint: expectedManufacturer,
      source_url: normalizeImageUrl(sourceUrl) ? sourceUrl : ''
    });
    const result = response?.data?.result || {};
    const image_url = normalizeImageUrl(result.image_url);
    const resolved = image_url
      ? { image_url, status: result.status || 'candidate', verified: result.status === 'verified_candidate', source: result.source_key || '' }
      : { image_url: '', status: result.status || 'not_found', verified: false, source: result.source_key || '' };
    try { sessionStorage.setItem(key, JSON.stringify(resolved)); } catch {}
    return resolved;
  } catch {
    const failed = { image_url: '', status: 'lookup_failed', verified: false };
    try { sessionStorage.setItem(key, JSON.stringify(failed)); } catch {}
    return failed;
  }
}
