import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isTechnicalSpecification, classifyIdentifier } from '../../shared/semanticResolver.js';

// Revalidación determinística del Knowledge Core.
// Por defecto SOLO AUDITA (dry_run=true). Nunca borra ni modifica datos sin apply=true.
// No contiene reglas por fabricante: valida significado, evidencia y trazabilidad.

function norm(v: unknown) {
  return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function partEvidenceIsDemonstrated(part: any, evidence: any, document: any, fact: any) {
  if (!evidence || !document || !fact) return { ok: false, reason: 'missing_part_fact_evidence_or_document' };
  if (!evidence.raw_text || !Number.isFinite(Number(evidence.page)) || Number(evidence.page) < 1) return { ok: false, reason: 'part_evidence_incomplete' };
  if (!evidence.rule_id) return { ok: false, reason: 'part_evidence_rule_missing' };
  if (norm(fact.value) !== norm(part.part_number)) return { ok: false, reason: 'demonstrated_fact_value_mismatch' };
  if (!norm(evidence.raw_text).includes(norm(part.part_number))) return { ok: false, reason: 'part_number_not_in_evidence' };

  const text = norm(evidence.raw_text);
  const pn = norm(part.part_number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const explicit = new RegExp(`(?:part number|part no|p/n|mpn|ordering number|order number|order code|model number|product number)\\s*[:#]?\\s*${pn}(?:\\b|$)`, 'i').test(text);
  if (explicit) return { ok: true, reason: 'explicit_part_number_evidence' };

  const titleHasPart = norm(document.title).includes(norm(part.part_number));
  const excluded = /(?:vref\d*|voltage reference|reference voltage|literature number|document number|revision|package|standard|jep\d*|jesd\d*|iec|iso|mil-std)/i.test(text);
  if (titleHasPart && !excluded) return { ok: true, reason: 'document_identity_corroborrated' };

  const candidate = {
    text: part.part_number,
    label: '',
    context_text: evidence.raw_text,
    label_same_line: false,
    label_exclusive: false
  };
  const role = classifyIdentifier(candidate);
  if (role.demonstrated && role.role === 'PART_NUMBER' && !excluded) return { ok: true, reason: role.reason };
  return { ok: false, reason: 'part_number_role_not_demonstrated' };
}

export default async function (req: Request) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const dryRun = body.apply !== true;
  const limit = Math.max(1, Math.min(500, Number(body.limit) || 500));

  const parts = await base44.asServiceRole.entities.Part.filter({ validation_state: 'published' }, 'created_date', limit);
  const specs = await base44.asServiceRole.entities.Specification.filter({ validation_state: 'published' }, 'created_date', limit);

  let partsValid = 0, partsInvalid = 0, specsValid = 0, specsInvalid = 0;
  const partReport: any[] = [];
  const specReport: any[] = [];

  for (const part of parts) {
    const evidences = await base44.asServiceRole.entities.Evidence.filter({ part_id: part.id }, 'created_date', 100).catch(() => []);
    let valid = false;
    let reason = 'no_valid_demonstrated_fact';
    let selected: any = null;
    for (const ev of evidences) {
      const facts = await base44.asServiceRole.entities.DemonstratedFact.filter({ part_id: part.id, evidence_id: ev.id }, 'created_date', 10).catch(() => []);
      for (const fact of facts) {
        const doc = await base44.asServiceRole.entities.Document.get(ev.document_id).catch(() => null);
        const source = doc?.source_id ? await base44.asServiceRole.entities.Source.get(doc.source_id).catch(() => null) : null;
        const provenance = await base44.asServiceRole.entities.Provenance.filter({ entity_type: 'part', entity_id: part.id, source_id: source?.id || '' }, 'created_date', 10).catch(() => []);
        const check = partEvidenceIsDemonstrated(part, ev, doc, fact);
        if (check.ok && !source) { valid = false; reason = 'missing_document_source'; }
        if (check.ok && source && !provenance.length) { valid = false; reason = 'missing_part_provenance'; }
        if (!valid && reason !== 'missing_document_source' && reason !== 'missing_part_provenance') { /* preserve detailed evidence failure */ }
        if (check.ok) { valid = true; selected = { evidence_id: ev.id, document_id: ev.document_id, rule_id: ev.rule_id, reason: check.reason }; break; }
        reason = check.reason;
      }
      if (valid) break;
    }
    if (valid) partsValid++; else partsInvalid++;
    const partState = valid ? 'published' : (reason.includes('not_demonstrated') || reason.includes('mismatch') ? 'rejected' : 'incomplete');
    partReport.push({ id: part.id, part_number: part.part_number, manufacturer_name: part.manufacturer_name, current_state: part.validation_state, verdict: valid ? 'VERIFIED' : partState.toUpperCase(), reason: valid ? selected.reason : reason, evidence: selected });
    if (!dryRun && !valid) await base44.asServiceRole.entities.Part.update(part.id, { validation_state: partState });
  }

  for (const spec of specs) {
    const ev = spec.evidence_id ? await base44.asServiceRole.entities.Evidence.get(spec.evidence_id).catch(() => null) : null;
    const doc = ev?.document_id ? await base44.asServiceRole.entities.Document.get(ev.document_id).catch(() => null) : null;
    const semantic = isTechnicalSpecification(spec.attribute_name, spec.original_value);
    const reasons: string[] = [];
    if (!ev) reasons.push('missing_evidence');
    if (!doc) reasons.push('missing_document');
    if (!doc?.source_id) reasons.push('missing_document_source_link');
    if (doc?.source_id && !await base44.asServiceRole.entities.Source.get(doc.source_id).catch(() => null)) reasons.push('document_source_not_found');
    if (!spec.source_id) reasons.push('missing_spec_source');
    if (!ev?.raw_text) reasons.push('missing_evidence_text');
    if (!Number.isFinite(Number(ev?.page)) || Number(ev?.page) < 1) reasons.push('missing_evidence_page');
    if (!ev?.rule_id) reasons.push('missing_evidence_rule');
    if (ev && ev.specification_id !== spec.id) reasons.push('evidence_specification_link_mismatch');
    if (ev && ev.part_id !== spec.part_id) reasons.push('evidence_part_link_mismatch');
    if (ev && norm(ev.raw_text).indexOf(norm(spec.original_value)) < 0) reasons.push('value_not_in_evidence');
    const specProvenance = await base44.asServiceRole.entities.Provenance.filter({ entity_type: 'specification', entity_id: spec.id, source_id: doc?.source_id || '' }, 'created_date', 10).catch(() => []);
    if (!specProvenance.length) reasons.push('missing_specification_provenance');
    if (!semantic.ok || semantic.role !== 'TECHNICAL_SPECIFICATION') reasons.push(semantic.reason);
    const valid = reasons.length === 0;
    if (valid) specsValid++; else specsInvalid++;
    const hardSemanticFailure = reasons.some((r) => ['non_technical_document_or_graph_context', 'insufficient_technical_semantics'].includes(r));
    const specState = valid ? 'published' : (hardSemanticFailure ? 'rejected' : 'incomplete');
    specReport.push({ id: spec.id, part_id: spec.part_id, attribute_name: spec.attribute_name, original_value: spec.original_value, current_state: spec.validation_state, verdict: valid ? 'VERIFIED' : specState.toUpperCase(), reasons, evidence_id: spec.evidence_id || null });
    if (!dryRun && !valid) await base44.asServiceRole.entities.Specification.update(spec.id, { validation_state: specState });
  }

  return Response.json({
    mode: dryRun ? 'dry_run' : 'apply',
    totals: { parts: parts.length, partsValid, partsInvalid, specifications: specs.length, specsValid, specsInvalid },
    parts: partReport,
    specifications: specReport
  });
}