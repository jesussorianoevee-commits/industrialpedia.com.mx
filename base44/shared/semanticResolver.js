// Semantic Resolver determinístico para conocimiento industrial.
// NO publica conocimiento. Solo clasifica candidatos y relaciones con evidencia contextual.
// Sin IA, sin fabricante hardcodeado, sin score de admisión.

const PART_LABELS = new Set([
  'part number', 'part no', 'part no.', 'part #', 'p/n', 'pn',
  'ordering number', 'order number', 'order no', 'order code',
  'model number', 'model no', 'product number', 'mpn', 'mfr part',
  'manufacturer part', 'manufacturer part number', 'orderable part number'
]);

const CONTEXTUAL_LABELS = new Set(['device', 'component']);

const ROLE_PATTERNS = [
  { role: 'LITERATURE_NUMBER', re: /\b(?:literature|lit(?:erature)?)\s+(?:number|no|#)\b/i },
  { role: 'REVISION', re: /\b(?:revision|rev\.?)\b/i },
  { role: 'PACKAGE', re: /\bpackage\b/i },
  { role: 'STANDARD_REFERENCE', re: /\b(?:jep|jesd|je[c]?d|iec|iso|mil[- ]std)\b/i },
  { role: 'VOLTAGE_REFERENCE', re: /\b(?:vref\d*|voltage\s+reference|reference\s+voltage)\b/i },
  { role: 'ELECTRICAL_VALUE', re: /(?:^|\s)\d+(?:\.\d+)?\s*(?:v|mv|kv|a|ma|ua|hz|khz|mhz|ohm|kohm|mohm|w|mw)(?:$|\s)/i }
];

const NEGATIVE_IDENTIFIER_PATTERNS = [
  /\bliterature\s+number\b/i, /\blit(?:erature)?\s*(?:no|#)\b/i,
  /\bdocument\s+(?:number|no|#)\b/i, /\brevision\b/i, /\brev\.?\b/i,
  /\bpackage\b/i, /\bserial\s+(?:number|no|#)\b/i, /\blot\s+(?:number|no|#)\b/i,
  /\bdate\b/i, /\bversion\b/i, /\bpage\b/i, /\bcatalog\s+(?:number|no|#)\b/i,
  /\b(?:jep|jesd|je[c]?d|iec|iso|mil[- ]std)\b/i
];

const EXCLUDED_PART_CONTEXT = [
  /\b(?:vref\d*|voltage\s+reference|reference\s+voltage)\b/i,
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
    const structurallyBound = !!candidate?.label_same_line || !!candidate?.label_exclusive;
    if (structurallyBound) return { role: 'PART_NUMBER', demonstrated: true, reason: 'explicit_part_number_label' };
    return { role: 'IDENTIFIER_CANDIDATE', demonstrated: false, reason: 'part_label_not_structurally_bound' };
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
    if (/\b(?:vref\d*|voltage\s+reference|reference\s+voltage)\b/i.test(context)) {
      return { role: 'VOLTAGE_REFERENCE', demonstrated: false, reason: 'voltage_reference_context' };
    }
    return { role: 'DOCUMENT_REFERENCE', demonstrated: false, reason: 'excluded_document_context' };
  }

  // "device"/"component" alone never proves PART_NUMBER. A contextual identity
  // must be corroborated by document identity evidence in the caller.
  if (CONTEXTUAL_LABELS.has(label)) {
    return { role: 'IDENTIFIER_CANDIDATE', demonstrated: false, reason: 'contextual_label_requires_corroboration' };
  }

  for (const { role, re } of ROLE_PATTERNS) {
    if (re.test(context) || re.test(text)) return { role, demonstrated: false, reason: `context_${role.toLowerCase()}` };
  }

  return { role: 'UNKNOWN', demonstrated: false, reason: 'insufficient_semantic_evidence' };
}

const GENERIC_TECHNICAL_ATTRIBUTE = /(?:^|[^a-z])(voltage|current|frequency|power|resistance|capacitance|inductance|temperature|pressure|flow|force|torque|speed|stroke|bore|diameter|length|width|height|weight|dimension|accuracy|repeatability|resolution|response|switching|load|range|supply|input|output|operating|storage|lifetime|duty|cycle|impedance|gain|bandwidth|delay|rise|fall|leakage|threshold|sensitivity|material|mounting|connection|connector|interface|communication|protection|insulation|ingress|thread|port|housing|package|size|rating|class|degree|seal|travel|displacement|hardness|viscosity|density|capacity|volume|area)(?:$|[^a-z])/i;
const ENGINEERING_VALUE = /[<>≤≥+\-]?\s*\d+(?:[.,]\d+)?\s*(?:%|°?c|°?f|v|mv|kv|a|ma|ua|ka|hz|khz|mhz|ghz|ohm|ω|kohm|mohm|f|uf|nf|pf|h|uh|mh|w|mw|kw|va|mm|cm|m|um|nm|in|mil|kg|g|mg|lb|n|kn|l|ml|bar|kpa|mpa|psi|rpm|ms|us|ns|s|db|dbm|deg|degree|x)(?:$|[ ,;])/i;

export function isTechnicalSpecification(attribute, value) {
  const a = normalized(attribute);
  const v = String(value || '').trim();
  if (!a || !v) return { ok: false, role: 'UNKNOWN', reason: 'missing_attribute_or_value' };

  const nonTechnical = [
    /^product[ ]+folder[ ]+links?$/i, /^catalog(?:[ ]+(?:number|no|#))?$/i, /^military$/i,
    /^typical[ ]+characteristics?$/i, /^\d+(?:\.\d+)*[ ]+typical[ ]+characteristics?/i,
    /^scale$/i, /^revision(?:[ ]+history)?$/i, /^document[ ]+(?:number|no|#)$/i,
    /^literature[ ]+(?:number|no|#)$/i, /(?:^|[^a-z])(top|bottom|middle)[ ]+trace(?:$|[^a-z])/i,
    /(?:^|[^a-z])(?:\d+(?:\.\d+)?[ ]*)?v\/div(?:$|[^a-z])/i,
    /(?:^|[^a-z])time[ ]*=.*\/div(?:$|[^a-z])/i,
    /(?:^|[^a-z])(page|figure|table)(?:[ ]*(number|no|#))?(?:$|[^a-z])/i
  ];
  if (nonTechnical.some((re) => re.test(a) || re.test(v))) {
    return { ok: false, role: 'DOCUMENT_METADATA', reason: 'non_technical_document_or_graph_context' };
  }
  if (a.length > 100 || a.split(/[ ]+/).length > 8) return { ok: false, role: 'UNKNOWN', reason: 'attribute_too_long' };
  if (GENERIC_TECHNICAL_ATTRIBUTE.test(a) && ENGINEERING_VALUE.test(v)) {
    return { ok: true, role: 'TECHNICAL_SPECIFICATION', reason: 'technical_attribute_and_engineering_value' };
  }
  return { ok: false, role: 'UNKNOWN', reason: 'insufficient_technical_semantics' };
}
