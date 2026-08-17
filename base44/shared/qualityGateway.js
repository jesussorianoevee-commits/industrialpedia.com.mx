// Quality Gateway determinístico para la ingesta. Sin IA, sin relajación.
// Ciclo: PROCESSED -> VALIDATED -> PUBLISHED | REJECTED | INCOMPLETE.
// Persistido != validado: un registro sólo se PUBLISHED si pasa todas las reglas.

const NON_TECHNICAL_SPEC_ATTRIBUTES = new Set([
  'product folder links', 'catalog', 'catalog number', 'military', 'typical characteristics',
  'scale', 'revision history', 'revision', 'document number', 'literature number'
]);

const GRAPH_OR_DOCUMENT_PATTERNS = [
  /\b(?:top|bottom|middle)\s+trace\b/i,
  /\btime\s*=.*\/div\b/i,
  /\b(?:\d+(?:\.\d+)?\s*)?v\/div\b/i,
  /\b(?:page|figure|table)\s*(?:number|no|#)?\b/i,
  /^\d+(?:\.\d+)*\s+typical\s+characteristics?/i
];

function normalizeAttribute(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function gatePart(rec) {
  const causes = [];
  if (!rec.part_number) causes.push('missing part_number');
  if (!rec.manufacturer_name) causes.push('missing manufacturer_name');

  const d = rec.part_demonstration;
  if (!d || d.role !== 'PART_NUMBER') causes.push('part_number_role_not_demonstrated');
  if (!d?.evidence_text) causes.push('part_number_evidence_missing');
  if (!Number.isFinite(Number(d?.page)) || Number(d.page) < 1) causes.push('part_number_page_missing');
  if (!d?.rule_id) causes.push('part_number_rule_missing');

  if (causes.length) return { pass: false, state: 'rejected', causes };
  if (!rec.specs || rec.specs.length === 0) {
    return { pass: false, state: 'incomplete', causes: ['no specifications extracted from document'] };
  }

  const specIncomplete = rec.specs.filter((s) => {
    return !s.original_value || !s.evidence_text || !s.semantic_role || s.semantic_role !== 'TECHNICAL_SPECIFICATION' || !Number.isFinite(Number(s.page)) || Number(s.page) < 1;
  });
  if (specIncomplete.length === rec.specs.length) {
    return { pass: false, state: 'incomplete', causes: ['all specifications lack complete evidence'] };
  }
  return { pass: true, state: 'published', causes: [] };
}

export function gateSpec(spec) {
  const causes = [];
  const attribute = normalizeAttribute(spec.attribute_name);
  if (!spec.original_value) causes.push('empty original_value');
  if (!spec.evidence_text) causes.push('missing evidence_text');
  if (!Number.isFinite(Number(spec.page)) || Number(spec.page) < 1) causes.push('missing evidence_page');
  if (spec.semantic_role !== 'TECHNICAL_SPECIFICATION') causes.push('technical_specification_role_not_demonstrated');
  if (NON_TECHNICAL_SPEC_ATTRIBUTES.has(attribute)) causes.push('non_technical_document_attribute');
  if (GRAPH_OR_DOCUMENT_PATTERNS.some((re) => re.test(String(spec.attribute_name || '')) || re.test(String(spec.original_value || '')))) {
    causes.push('graph_or_document_context');
  }
  if (/^\d+(?:\.\d+)*\s+(?:typical characteristics|applications|features|description|revision history)$/i.test(String(spec.attribute_name || '').trim())) {
    causes.push('document_section_heading');
  }
  if (causes.length) return { pass: false, state: 'rejected', causes };
  return { pass: true, state: 'published', causes: [] };
}