// Persistencia determinística de resultados descubiertos en DiscoveryIndex.
// Sin IA. Idempotente por URL normalizada y por PN normalizado + fabricante.
// Si el registro ya existe, actualiza last_seen (y rellena campos vacíos) en
// lugar de crear un duplicado. No inventa fabricante, PN ni especificaciones.
//
// CatalogProduct NO se crea aquí: se materializa después, cuando exista evidencia
// suficiente (al abrir la ficha → ExtraerFichaTecnica, o vía MaterializeDiscovery).

import { normalizePartNumber } from './normalize.js';
import { sanitizeResultIdentity } from './identityGuard.js';

export function normalizeSourceUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const path = (u.pathname || '').replace(/\/+$/, '');
    return `${u.origin}${path}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function safe(s, max) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sourceTypeEnum(result) {
  if (result.is_pdf || /\.pdf(?:$|[?#])/i.test(result.url || '')) return 'datasheet';
  return 'website';
}

function confidenceFor(sourceType) {
  if (sourceType === 'official') return 0.8;
  if (sourceType === 'distributor') return 0.65;
  return 0.4;
}

// Persiste un lote de resultados descubiertos. Devuelve { created, updated, skipped }.
export async function persistDiscoveryResults(base44, results, query = '') {
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const rRaw of results || []) {
    try {
      // Sanitizar identidad antes de persistir: no guardar manufacturer_name o
      // part_number derivados de tokens de la consulta. La consulta se pasa
      // como contexto para validar, pero no se persiste.
      const r = sanitizeResultIdentity(rRaw, query);
      const url = String(r.url || '').trim();
      if (!url) { skipped++; continue; }
      const urlNorm = normalizeSourceUrl(url);
      const pn = safe(r.part_number, 80);
      const pnNorm = pn ? normalizePartNumber(pn) : '';
      const manufacturer = safe(r.manufacturer_name, 100);

      const payload = {
        source_url: url,
        source_url_normalized: urlNorm,
        document_url: url,
        title: safe(r.title, 300),
        description: safe(r.snippet || r.description, 1000),
        candidate_part_number: pn,
        candidate_part_number_normalized: pnNorm,
        manufacturer_name: manufacturer,
        source_type: sourceTypeEnum(r),
        source_provider: 'tavily',
        image_url: safe(r.image_url, 500),
        discovery_state: 'discovered',
        confidence: confidenceFor(r.source_type),
        last_seen: now
      };

      // Dedup por URL normalizada: si el registro ya existe, actualizar last_seen
      // y rellenar campos que estuvieran vacíos. No se dedup por PN+fabricante
      // porque el PN de la consulta se copia a todos los resultados y no constituye
      // evidencia por resultado.
      const byUrl = await base44.asServiceRole.entities.DiscoveryIndex.filter(
        { source_url_normalized: urlNorm }, '-updated_date', 1
      ).catch(() => []);
      if (byUrl.length) {
        const existing = byUrl[0];
        const patch = { last_seen: now, title: payload.title || existing.title, description: payload.description || existing.description };
        if (payload.image_url && !existing.image_url) patch.image_url = payload.image_url;
        if (payload.manufacturer_name && !existing.manufacturer_name) patch.manufacturer_name = payload.manufacturer_name;
        if (payload.candidate_part_number && !existing.candidate_part_number) {
          patch.candidate_part_number = payload.candidate_part_number;
          patch.candidate_part_number_normalized = payload.candidate_part_number_normalized;
        }
        await base44.asServiceRole.entities.DiscoveryIndex.update(existing.id, patch).catch(() => {});
        updated++;
        continue;
      }

      await base44.asServiceRole.entities.DiscoveryIndex.create(payload);
      created++;
    } catch {
      skipped++;
    }
  }

  return { created, updated, skipped, total: (results || []).length };
}