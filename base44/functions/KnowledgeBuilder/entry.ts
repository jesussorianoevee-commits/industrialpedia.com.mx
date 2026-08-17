import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { extractPDF } from '../../shared/pdfExtract.js';
import { extractHTML, extractPlainText } from '../../shared/extract.js';
import { extractCandidates, induceGrammar } from '../../shared/knowledgeBuilder.js';

// Manufacturer Knowledge Builder (determinístico, sin IA).
// action=extract: extrae candidatos con contexto de un documento y los persiste (corpus).
// action=induce:  induce grammar versionada, valida FUERA de muestra y promueve a ACTIVA solo si generaliza.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'extract';

    if (action === 'extract') {
      const url = body.url;
      if (!url) return Response.json({ error: 'url required' }, { status: 400 });
      const res = await fetch(url, { headers: { 'User-Agent': 'IndustrialpediaKB/1.0 (deterministic)' } });
      if (!res.ok) return Response.json({ error: 'HTTP ' + res.status }, { status: 502 });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const isPdf = url.toLowerCase().endsWith('.pdf') || ct.includes('pdf');
      let extracted;
      if (isPdf) { const buf = await res.arrayBuffer(); extracted = await extractPDF(new Uint8Array(buf)); }
      else { const raw = await res.text(); extracted = /<\/html>/i.test(raw) || ct.includes('html') ? extractHTML(raw) : extractPlainText(raw); }
      const candidates = extractCandidates(extracted.text, extracted.pages);
      const manufacturer = body.manufacturer || '';
      const created = await base44.asServiceRole.entities.CandidateIdentifier.bulkCreate(
        candidates.slice(0, 60).map(c => ({
          source_id: body.source_id || '', manufacturer, document_id: body.document_id || '',
          crawl_document_id: body.crawl_document_id || '', url,
          candidate_text: c.text, format_sig: c.format_sig, page: c.page, line_index: c.line_index,
          label: c.label || '', label_type: c.label_type, in_title: !!c.in_title
        }))
      );
      return Response.json({ url, extractable: extracted.extractable, candidate_count: candidates.length, persisted: Array.isArray(created) ? created.length : 0, candidates });
    }

    if (action === 'induce') {
      const filter = {};
      if (body.source_id) filter.source_id = body.source_id;
      else if (body.manufacturer) filter.manufacturer = body.manufacturer;
      else return Response.json({ error: 'source_id or manufacturer required' }, { status: 400 });
      const all = await base44.asServiceRole.entities.CandidateIdentifier.filter(filter, 'created_date', 2000);
      const byDoc = {};
      for (const c of all) {
        (byDoc[c.crawl_document_id] ||= { doc_id: c.crawl_document_id, candidates: [] }).candidates.push({
          text: c.candidate_text, format_sig: c.format_sig, page: c.page, line_index: c.line_index,
          label: c.label, label_type: c.label_type, in_title: c.in_title
        });
      }
      const docs = Object.values(byDoc);
      if (docs.length < 2) {
        return Response.json({ error: 'se requieren >=2 documentos para validacion fuera de muestra', docs: docs.length, status: 'pending' });
      }
      const result = induceGrammar(docs);
      const prev = await base44.asServiceRole.entities.PartNumberGrammar.filter(filter, '-version', 1);
      const version = (prev.length && prev[0].version ? prev[0].version : 0) + 1;
      const grammar = await base44.asServiceRole.entities.PartNumberGrammar.create({
        ...filter, field: 'part_number', selector: result.selector, format_sig: result.format_sig,
        negative_formats: result.negative_formats, positive_labels: result.positive_labels,
        negative_labels: result.negative_labels, induction_doc_ids: result.induction_doc_ids,
        validation_doc_ids: result.validation_doc_ids, version, hash: result.hash,
        status: result.status, tp: result.tp, fp: result.fp, fn: result.fn, coverage: result.coverage
      });
      // Observaciones pendientes de la validación (candidatos sin eslabón demostrado).
      for (const po of result.pending_observations || []) {
        await base44.asServiceRole.entities.PendingObservation.create({
          document_id: po.doc_id, ...filter, candidate_text: po.candidate.text,
          page: po.candidate.page, line_index: po.candidate.line_index,
          label: po.candidate.label || '', label_type: po.candidate.label_type,
          grammar_id: grammar.id, missing_link: po.missing_link
        });
      }
      return Response.json({ grammar_id: grammar.id, version, status: result.status, ...result });
    }

    return Response.json({ error: 'unknown action: extract | induce' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}