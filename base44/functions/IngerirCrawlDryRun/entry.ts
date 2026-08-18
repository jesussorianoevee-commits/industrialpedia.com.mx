import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizeUnit, splitValueUnit, normalizePartNumber } from '../../shared/normalize.js';
import { gatePart, gateSpec } from '../../shared/qualityGateway.js';
import { extractHTML, extractPlainText, extractTextSpecs, findPageFor } from '../../shared/extract.js';
import { extractPDF, extractStructuredSpecs } from '../../shared/pdfExtract.js';
import { extractCandidates, selectPartNumber } from '../../shared/knowledgeBuilder.js';
import { isTechnicalSpecification } from '../../shared/semanticResolver.js';
import { validateDownloadedDocument } from '../../shared/documentIntegrity.js';

// Diagnóstico aislado y no destructivo del pipeline de ingesta.
// Reutiliza las mismas funciones compartidas que IngerirCrawl.
// IMPORTANTE: este módulo NO contiene operaciones de escritura sobre entidades.

const READ_LIMIT = 500;

function ruleIdForSelection(sel: any) {
  if (!sel?.demonstrated) return '';
  if (sel.reason === 'explicit_part_number_label') return 'PN.EXPLICIT_LABEL.v1';
  if (sel.reason === 'explicit_part_number_table_header') return 'PN.TABLE_HEADER_BINDING.v1';
  if (sel.reason === 'active_grammar') return 'PN.ACTIVE_GRAMMAR.v1';
  if (sel.reason === 'contextual_identity_corroborrated') return 'PN.CONTEXTUAL_CORROBORATED.v1';
  if (sel.reason === 'manual_verified_against_document') return 'PN.MANUAL_VERIFIED.v1';
  return '';
}

function buildSpec(extracted: any, raw: any) {
  const { value, unit } = splitValueUnit(raw.value);
  const page = Number.isFinite(Number(raw.page)) ? Number(raw.page) : findPageFor(raw.value, extracted.pages);
  const semantic = isTechnicalSpecification(raw.attribute, raw.value);
  return {
    attribute_name: raw.attribute,
    attribute_canonical: raw.attribute,
    original_value: raw.value,
    normalized_value: value,
    original_unit: unit,
    normalized_unit: normalizeUnit(unit),
    page,
    evidence_text: raw.attribute + ': ' + raw.value,
    evidence_bbox: raw.bbox || null,
    evidence_context: raw.context || '',
    semantic_role: semantic.role,
    semantic_reason: semantic.reason
  };
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const documentId = String(body.document_id || '').trim();
    const contentHash = String(body.content_hash || '').trim();
    if (!documentId && !contentHash) {
      return Response.json({ error: 'document_id or content_hash is required' }, { status: 400 });
    }

    // READ-ONLY: locate the historical document and its related read-only records.
    const document = documentId
      ? await base44.asServiceRole.entities.Document.get(documentId).catch(() => null)
      : ((await base44.asServiceRole.entities.Document.filter({ content_hash: contentHash }, 'updated_date', 1).catch(() => []))[0] || null);
    if (!document) return Response.json({ error: 'Document not found' }, { status: 404 });

    const crawlDocs = await base44.asServiceRole.entities.CrawlDocument.filter({ content_hash: document.content_hash }, 'created_date', READ_LIMIT).catch(() => []);
    const tasks = await base44.asServiceRole.entities.IngestionTask.filter({ content_hash: document.content_hash }, 'created_date', READ_LIMIT).catch(() => []);
    const existingSource = document.source_id
      ? await base44.asServiceRole.entities.Source.get(document.source_id).catch(() => null)
      : null;

    const task = tasks[0] || null;
    const crawlDocument = crawlDocs[0] || null;
    const sourceId = document.source_id || task?.source_id || crawlDocument?.source_id || '';
    const source = sourceId ? await base44.asServiceRole.entities.CrawlSource.get(sourceId).catch(() => null) : null;
    const url = document.file_url || task?.url || crawlDocument?.url || '';
    if (!url) return Response.json({ error: 'No source URL available for document' }, { status: 422 });

    // Same document acquisition/extraction path as IngerirCrawl, but every result stays in memory.
    const res = await fetch(url, { headers: { 'User-Agent': 'IndustrialpediaIngestaDryRun/1.0 (deterministic)' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const payload = new Uint8Array(await res.arrayBuffer());
    const integrity = await validateDownloadedDocument({ bytes: payload, contentType: ct, url });
    if (!integrity.valid) {
      return Response.json({
        mode: 'dry_run_detailed',
        writes: false,
        document: { id: document.id, current_source_id: document.source_id || null },
        task: task ? { id: task.id, state: task.state, content_hash: task.content_hash } : null,
        integrity,
        result: null
      });
    }

    const isPdf = integrity.detected_pdf;
    let extracted;
    if (isPdf) extracted = await extractPDF(payload);
    else {
      const raw = new TextDecoder().decode(payload);
      extracted = /<\/html>/i.test(raw) || ct.includes('html') ? extractHTML(raw) : extractPlainText(raw);
    }
    if (!extracted.extractable) throw new Error(extracted.reason || 'not extractable');

    const manufacturerName = (body.manufacturer_hint || source?.manufacturer || task?.manufacturer || '').trim();
    const idCandidates = extractCandidates(extracted.text, extracted.pages, extracted.blocks || [], extracted.tables || []);
    const grammarList = sourceId
      ? await base44.asServiceRole.entities.PartNumberGrammar.filter({ source_id: sourceId, status: 'active' }, '-version', 1).catch(() => [])
      : (manufacturerName ? await base44.asServiceRole.entities.PartNumberGrammar.filter({ manufacturer: manufacturerName, status: 'active' }, '-version', 1).catch(() => []) : []);
    const grammar = grammarList[0] || null;

    const manualPN = String(body.part_number_hint || '').trim();
    const manualCandidate = manualPN
      ? idCandidates.find((c) => normalizePartNumber(c.text) === normalizePartNumber(manualPN))
      : null;
    const sel = manualPN
      ? (manualCandidate
        ? { value: manualPN, demonstrated: true, reason: 'manual_verified_against_document', role: 'PART_NUMBER', candidate: manualCandidate, grammar_id: '' }
        : { value: '', demonstrated: false, reason: 'manual_hint_not_found_in_document', role: 'UNKNOWN', candidate: null, grammar_id: '' })
      : selectPartNumber(idCandidates, grammar);

    const partNumber = sel.value || '';
    const rawSpecs = isPdf
      ? extractStructuredSpecs(extracted)
      : ((extracted.specTable && extracted.specTable.length) ? extracted.specTable : extractTextSpecs(extracted.text));
    const specs = rawSpecs.filter((r) => r.attribute && r.value).map((r) => buildSpec(extracted, r));
    const partCandidate = sel.candidate;
    const rec = {
      part_number: partNumber,
      part_number_normalized: normalizePartNumber(partNumber),
      manufacturer_name: manufacturerName,
      description: (extracted.title || extracted.text || '').slice(0, 240),
      specs,
      raw_text: extracted.text,
      part_demonstration: sel.demonstrated && partCandidate ? {
        role: sel.role || 'PART_NUMBER',
        candidate_text: partCandidate.text,
        evidence_text: partCandidate.context_text || partCandidate.text,
        page: partCandidate.page,
        rule_id: ruleIdForSelection(sel)
      } : null
    };

    const partGate = gatePart(rec);
    const specReports = specs.map((s) => {
      const gate = gateSpec(s);
      return {
        attribute_name: s.attribute_name,
        original_value: s.original_value,
        semantic_role: s.semantic_role,
        semantic_reason: s.semantic_reason,
        page: s.page,
        proposed_rule_id: gate.pass ? 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1' : '',
        verdict: gate.state === 'published' ? 'VERIFIED' : gate.state.toUpperCase(),
        reasons: gate.causes,
        evidence: {
          raw_text: s.evidence_text,
          page: s.page,
          bbox: s.evidence_bbox,
          document_id: document.id,
          specification_id: null
        },
        proposed_provenance: gate.pass ? {
          entity_type: 'specification',
          operation: 'validate',
          source_id: sourceId || null,
          rule_id: 'SPEC.TECHNICAL_ATTRIBUTE_VALUE.v1'
        } : null
      };
    });

    const existingSpecRecords = await base44.asServiceRole.entities.Specification.filter({ part_id: document.part_id || '' }, 'created_date', READ_LIMIT).catch(() => []);
    const proposedSourceId = sourceId || null;
    const partEvidence = rec.part_demonstration ? {
      raw_text: rec.part_demonstration.evidence_text,
      page: rec.part_demonstration.page,
      rule_id: rec.part_demonstration.rule_id,
      document_id: document.id
    } : null;

    return Response.json({
      mode: 'dry_run_detailed',
      writes: false,
      inputs: { document_id: document.id, content_hash: document.content_hash || null, url, part_number_hint: manualPN || null },
      current: {
        document: { id: document.id, source_id: document.source_id || null, status: document.status, content_hash: document.content_hash || null },
        source: existingSource ? { id: existingSource.id, document_id: existingSource.document_id, url: existingSource.url } : null,
        crawl_document: crawlDocument ? { id: crawlDocument.id, state: crawlDocument.state, ingested: crawlDocument.ingested } : null,
        ingestion_task: task ? { id: task.id, state: task.state, attempts: task.attempts, specs_published: task.specs_published } : null,
        existing_specifications: existingSpecRecords.length
      },
      proposed: {
        document: { source_id: proposedSourceId },
        part: {
          part_number: rec.part_number,
          manufacturer_name: rec.manufacturer_name,
          semantic_role: rec.part_demonstration?.role || null,
          rule_id: rec.part_demonstration?.rule_id || null,
          verdict: partGate.state === 'published' ? 'VERIFIED' : partGate.state.toUpperCase(),
          reasons: partGate.causes,
          evidence: partEvidence
        },
        specifications: specReports,
        provenance: {
          part: partGate.pass && proposedSourceId ? {
            entity_type: 'part', operation: 'extract', source_id: proposedSourceId,
            rule_id: 'extract.' + (isPdf ? 'pdf' : 'html')
          } : null,
          specification_count: specReports.filter((s) => s.proposed_provenance).length
        }
      },
      counts: {
        candidates: idCandidates.length,
        extracted_specifications: specs.length,
        verified_specifications: specReports.filter((s) => s.verdict === 'VERIFIED').length,
        rejected_specifications: specReports.filter((s) => s.verdict === 'REJECTED').length,
        incomplete_specifications: specReports.filter((s) => s.verdict === 'INCOMPLETE').length
      }
    });
  } catch (error) {
    return Response.json({ mode: 'dry_run_detailed', writes: false, error: error?.message || String(error), stack: error?.stack }, { status: 500 });
  }
}
