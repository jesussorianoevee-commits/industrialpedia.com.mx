// Semantic Resolver determinístico para conocimiento industrial.
// NO publica conocimiento. Solo clasifica candidatos y relaciones con evidencia contextual.
// Sin IA, sin fabricante hardcodeado, sin score de admisión.

const PART_LABELS = new Set([
  'part number', 'part no', 'part no.', 'part #', 'p/n', 'pn',
  'ordering number', 'order number', 'order no', 'order code',
  'model number', 'model no', 'product number', 'mpn', 'mfr part',
  'manufacturer part', 'manufacturer part number', 'orderable part number'
]);

const NEGATIVE_IDENTIFIER_PATTERNS = [
  /\bliterature\s+number\b/i, /\blit(?:erature)?\s*(?:no|#)\b/i,
  /\bdocument\s+(?:number|no|#)\b/i, /\brevision\b/i, /\brev\.?\b/i,
  /\bpackage\b/i, /\bserial\s+(?:number|no|#)\b/i, /\blot\s+(?:number|no|#)\b/i,
  /\bdate\b/i, /\bversion\b/i, /\bpage\b/i, /\bcatalog\s+(?:number|no|#)\b/i,
  /\b(?:jep|jesd|je[c]?d|iec|iso|mil[- ]std)\b/i
];

const EXCLUDED_PART_CONTEXT = [
  /\b(?:vref|voltage\s+reference|reference\s+voltage)\b/i,
  /\b(?:supply|input|output)\s+voltage\b/i,
  /\b(?:typical\s+characteristics|electrical\s+characteristics)\b/i,
  /\b(?:literature|document)\s+(?:number|no|#)\b/i,
  /\b(?:revision|rev\.?|package|catalog)\b/i,
  /\b(?:standard|jep|jesd|iec|iso|mil[- ]std)\b/i
];

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
}

export function classifyIdentifier(candidate) {
  const label = normalized(candidate?.label);
  const context = normalized(candidate?.context_text);
  const text = normalized(candidate?.text);

  if (PART_LABELS.has(label)) {
    return { role: 'PART_NUMBER', demonstrated: true, reason: 'explicit_part_number_label' };
  }
  if (NEGATIVE_IDENTIFIER_PATTERNS.some((re) => re.test(label))) {
    if (/literature/i.test(label)) return { role: 'LITERATURE_NUMBER', demonstrated: false, reason: 'negative_literature_label' };
    if (/revision|rev/i.test(label)) return { role: 'REVISION', demonstrated: false, reason: 'negative_revision_label' };
    if (/package/i.test(label)) return { role: 'PACKAGE', demonstrated: false, reason: 'negative_package_label' };
    return { role: 'DOCUMENT_REFERENCE', demonstrated: false, reason: 'negative_identifier_label' };
  }

  if (/^\d+(?:\.\d+)?\s*(?:v|mv|kv|a|ma|ua|hz|khz|mhz|ohm|kohm|mohm|w|mw)$/i.test(text)) {
    return { role: 'ELECTRICAL_VALUE', demonstrated: false, reason: 'value_shape_not_identifier' };
  }
  if (EXCLUDED_PART_CONTEXT.some((re) => re.test(context))) {
    if (/\b(?:jep|jesd|je[c]?d|iec|iso|mil[- ]std|standard)\b/i.test(context)) {
      return { role: 'STANDARD_REFERENCE', demonstrated: false, reason: 'standard_context' };
    }
    if (/\b(?:vref|voltage\s+reference|reference\s+voltage)\b/i.test(context)) {
      return { role: 'VOLTAGE_REFERENCE', demonstrated: false, reason: 'voltage_reference_context' };
    }
    return { role: 'DOCUMENT_REFERENCE', demonstrated: false, reason: 'excluded_document_context' };
  }

  // "device"/"component" alone never proves PART_NUMBER. A contextual identity
  // must be corroborated by title or repeated first-page occurrence in the caller.
  if (label === 'device' || label === 'component') {
    return { role: 'IDENTIFIER_CANDIDATE', demonstrated: false, reason: 'contextual_label_requires_corroboration' };
  }

  return { role: 'UNKNOWN', demonstrated: false, reason: 'insufficient_semantic_evidence' };
}

export function isTechnicalSpecification(attribute, value) {
  const a = normalized(attribute);
  const v = String(value || '').trim();
  if (!a || !v) return { ok: false, role: 'UNKNOWN', reason: 'missing_attribute_or_value' };

  const nonTechnical = [
    /^product\s+folder\s+links?$/i,
    /^catalog(?:\s+(?:number|no|#))?$/i,
    /^military$/i,
    /^typical\s+characteristics?$/i,
    /^\d+(?:\.\d+)*\s+typical\s+characteristics?/i,
    /^scale$/i,
    /^revision(?:\s+history)?$/i,
    /^document\s+(?:number|no|#)$/i,
    /^literature\s+(?:number|no|#)$/i,
    /\b(?:top|bottom|middle)\s+trace\b/i,
    /\b(?:\d+(?:\.\d+)?\s*)?v\/div\b/i,
    /\btime\s*=.*\/div\b/i,
    /\b(?:page|figure|table)\s*(?:number|no|#)?\b/i
  ];
  if (nonTechnical.some((re) => re.test(a) || re.test(v))) {
    return { ok: false, role: 'DOCUMENT_METADATA', reason: 'non_technical_document_or_graph_context' };
  }

  // Current deterministic text extractor only accepts numeric values. Keep that
  // conservative contract and require a technical-looking numeric/value relation.
  if (!/\d/.test(v)) return { ok: false, role: 'UNKNOWN', reason: 'value_has_no_numeric_anchor' };
  if (a.length > 100 || a.split(/\s+/).length > 8) return { ok: false, role: 'UNKNOWN', reason: 'attribute_too_long' };

  return { ok: true, role: 'TECHNICAL_SPECIFICATION', reason: 'technical_attribute_value_relation' };
}
