import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { autoTranslatePart } from '../../shared/autoTranslatePart.ts';

const LANGUAGES = ['es', 'en', 'de', 'fr', 'zh'];
const MAX_PARTS = 10;

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

    const parts = await base44.asServiceRole.entities.Part.filter({ id: { $in: partIds } }, '-updated_date', MAX_PARTS);
    const results = [];
    for (const part of parts) {
      try {
        const existing = await base44.asServiceRole.entities.PartTranslation.filter(
          { part_id: part.id, language }, '-updated_date', 1
        );
        if (existing?.length) {
          results.push({ part_id: part.id, language, status: 'already_exists' });
          continue;
        }
        const result = await autoTranslatePart(base44, part);
        results.push({ part_id: part.id, language, status: result.created ? 'created' : 'failed', created: result.created || 0 });
      } catch (error) {
        results.push({ part_id: part.id, language, status: 'failed', error: error?.message || String(error) });
      }
    }

    return Response.json({
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'already_exists').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}