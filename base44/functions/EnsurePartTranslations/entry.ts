import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { autoTranslatePart } from '../../shared/autoTranslatePart.ts';

const LANGUAGES = ['es', 'en', 'de', 'fr', 'zh'];
const MAX_PARTS = 10;
const SUPABASE_URL = 'https://stwwywzuzbkyoecjujeh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8K6JjRS7ga1H5jfmVCqQrA_V6ZvT3r_';
const CANONICAL_PART_URL = `${SUPABASE_URL}/functions/v1/industrialpedia-search-v17`;

async function loadCanonicalPart(id: string) {
  const url = new URL(CANONICAL_PART_URL);
  url.searchParams.set('mode', 'part');
  url.searchParams.set('id', id);
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      Accept: 'application/json'
    }
  });
  const data = await response.json().catch(() => null);
  const part = data?.part;
  if (!response.ok || !data?.found || !part?.id) return null;

  return {
    id: String(part.id),
    part_number: part.part_number || '',
    manufacturer_name: part.manufacturer_name || part.manufacturer || '',
    manufacturer: part.manufacturer_name || part.manufacturer || '',
    name: part.name || part.product_name || part.title || part.part_number || '',
    product_name: part.product_name || part.name || part.title || '',
    description: part.description || part.name || part.product_name || '',
    category: part.category || '',
    subcategory: part.subcategory || '',
    specifications: part.specifications && typeof part.specifications === 'object' && !Array.isArray(part.specifications)
      ? part.specifications
      : {}
  };
}

/**
 * On-demand multilingual backfill for legacy Knowledge Core records.
 * It is intentionally bounded: the search UI can request only the records it
 * is displaying, while the authoritative Part data remains untouched.
 */
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const language = String(body.language || '').toLowerCase();
    const partIds = Array.isArray(body.part_ids)
      ? [...new Set(body.part_ids.map((id: unknown) => String(id || '').trim()).filter(Boolean))].slice(0, MAX_PARTS)
      : [];

    if (!LANGUAGES.includes(language)) {
      return Response.json({ error: 'Unsupported language' }, { status: 400 });
    }
    if (!partIds.length) return Response.json({ created: 0, skipped: 0, failed: 0, part_ids: [] });

    // Prefer the legacy Base44 Part when it exists, but the public catalog is
    // now canonical in Supabase. A translation request must therefore also work
    // for canonical IDs that were never duplicated into Base44.
    const localParts = await base44.asServiceRole.entities.Part.filter({ id: { $in: partIds } }, '-updated_date', MAX_PARTS);
    const partsById = new Map(localParts.map((part: any) => [String(part.id), part]));
    const missingIds = partIds.filter((id) => !partsById.has(id));
    const canonicalParts = await Promise.all(missingIds.map((id) => loadCanonicalPart(id).catch(() => null)));
    for (const part of canonicalParts) {
      if (part?.id) partsById.set(String(part.id), part);
    }

    const results = [];
    for (const requestedId of partIds) {
      const part = partsById.get(requestedId);
      if (!part) {
        results.push({ part_id: requestedId, language, status: 'failed', error: 'canonical_part_not_found' });
        continue;
      }
      try {
        const result = await autoTranslatePart(base44, part, {
          languages: [language],
          // Refresh only machine drafts. Reviewed/published translations remain
          // immutable here, while stale drafts can be repaired on demand.
          refreshMachineDrafts: true
        });
        const changed = (result.created || 0) + (result.updated || 0);
        results.push({ part_id: part.id, language, status: changed ? 'created_or_refreshed' : 'already_current', created: result.created || 0, updated: result.updated || 0 });
      } catch (error) {
        results.push({ part_id: part.id, language, status: 'failed', error: error?.message || String(error) });
      }
    }

    return Response.json({
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'already_current').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}