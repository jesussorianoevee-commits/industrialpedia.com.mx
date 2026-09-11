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
  return `industrialpedia:image:v3:${mf}:${pn}`;
}

export function clearProductImageCache(partNumber, manufacturer = '') {
  try { sessionStorage.removeItem(cacheKey(partNumber, manufacturer)); } catch {}
}

/**
 * @param {{
 *   partNumber?: string;
 *   manufacturer?: string;
 *   sourceUrl?: string;
 *   existingUrl?: string;
 *   forceLookup?: boolean;
 * }} options
 */
export async function resolveProductImage({ partNumber, manufacturer = '', sourceUrl = '', existingUrl = '', forceLookup = false } = {}) {
  const existing = normalizeImageUrl(existingUrl);
  if (existing && !forceLookup) return { image_url: existing, status: 'existing', verified: false };

  const exactPartNumber = String(partNumber || '').trim();
  const expectedManufacturer = String(manufacturer || '').trim();
  if (!exactPartNumber) return { image_url: '', status: 'not_found', verified: false };

  const key = cacheKey(exactPartNumber, expectedManufacturer);
  const normalizedSourceUrl = normalizeImageUrl(sourceUrl);
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      const age = Date.now() - Number(parsed?.cached_at || 0);
      const normalizedCachedUrl = normalizeImageUrl(parsed?.image_url);
      if (normalizedCachedUrl && age < 24 * 60 * 60 * 1000) return { ...parsed, image_url: normalizedCachedUrl };

      // Un resultado negativo solo es reutilizable si fue obtenido con la misma
      // evidencia de origen. Antes una búsqueda sin sourceUrl podía guardar
      // "not_found" y bloquear la búsqueda posterior con la URL oficial exacta.
      const cachedSourceUrl = normalizeImageUrl(parsed?.source_url);
      const sameSourceEvidence = cachedSourceUrl === normalizedSourceUrl;
      if (parsed?.status && sameSourceEvidence && age < 5 * 60 * 1000) return parsed;
    }
  } catch {}

  // Adquisición de imágenes (AdquirirImagenAPI) desconectada de Base44; reemplazo
  // real en Supabase pendiente para la sesión de ingesta. Por ahora no hay lookup.
  const failed = { image_url: '', status: 'lookup_failed', verified: false, source_url: normalizedSourceUrl };
  try { sessionStorage.setItem(key, JSON.stringify({ ...failed, cached_at: Date.now() })); } catch {}
  return failed;
}
