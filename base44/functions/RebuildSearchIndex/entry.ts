import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Rebuild determinístico del índice de BUSCAR a partir del Knowledge Core.
// No usa IA, embeddings ni llama al crawler.

async function indexPart(base44, part) {
  const specs = await base44.asServiceRole.entities.Specification.filter(
    { part_id: part.id }, '-updated_date', 2000
  ).catch(() => []);
  const evidence = await base44.asServiceRole.entities.Evidence.filter(
    { part_id: part.id }, '-updated_date', 2000
  ).catch(() => []);
  const documentIds = [...new Set(evidence.map((e) => e.document_id).filter(Boolean))];
  const specText = specs.map((s) => [
    s.attribute_canonical || s.attribute_name || '',
    s.normalized_value || s.original_value || '',
    s.normalized_unit || s.original_unit || ''
  ].join(' ')).join(' | ');
  const searchText = [
    part.part_number || '', part.part_number_normalized || '',
    part.manufacturer_name || '', part.category || '', part.subcategory || '',
    part.description || '', specText
  ].join(' ').replace(/\s+/g, ' ').trim();
  const payload = {
    part_id: part.id,
    document_id: documentIds[0] || '',
    part_number: part.part_number || '',
    part_number_normalized: part.part_number_normalized || '',
    manufacturer_name: part.manufacturer_name || '',
    category: part.category || '',
    subcategory: part.subcategory || '',
    description: part.description || '',
    search_text: searchText,
    spec_text: specText,
    validation_state: part.validation_state || 'processed',
    evidence_count: evidence.length,
    source_count: new Set(specs.map((s) => s.source_id).filter(Boolean)).size,
    spec_count: specs.length
  };
  const existing = await base44.asServiceRole.entities.SearchIndex.filter({ part_id: part.id }, 'updated_date', 1).catch(() => []);
  if (existing.length) {
    await base44.asServiceRole.entities.SearchIndex.update(existing[0].id, payload);
    return { action: 'updated', id: existing[0].id };
  }
  const created = await base44.asServiceRole.entities.SearchIndex.create(payload);
  return { action: 'created', id: created.id };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(5000, Number(body.limit) || 1000));
    const parts = await base44.asServiceRole.entities.Part.list('-updated_date', limit);
    let created = 0, updated = 0, failed = 0;
    const report = [];
    for (const part of parts) {
      try {
        const r = await indexPart(base44, part);
        if (r.action === 'created') created++; else updated++;
      } catch (e) {
        failed++;
        report.push({ part_id: part.id, part_number: part.part_number, error: e?.message || String(e) });
      }
    }
    return Response.json({ mode: 'rebuild_search_index', indexed: created + updated, created, updated, failed, scanned: parts.length, report });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
