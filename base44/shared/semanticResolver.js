// Semantic Resolver determinístico para conocimiento industrial.
// NO publica conocimiento. Solo clasifica candidatos y relaciones con evidencia contextual.
// Sin IA, sin fabricante hardcodeado, sin score de admisión.

const PART_LABELS = new Set([
  'part number', 'part no', 'part no.', 'part #', 'p/n', 'pn',
  'ordering number', 'order number', 'order no', 'order code',
  'model number', 'model no', 'product number', 'article number', 'material number', 'material no', 'material #', 'mpn', 'mfr part',
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
  /\b(?:jep|jesd|je[c]?d|iec|iso|mil[- ]std)(?:[-/ ]?\d+[A-Z0-9.-]*)?\b/i,
  /\b(?:standard|std)\s+(?:number|no|#|reference|ref(?:erence)?|compliance)\b/i
];

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
}

// Section headings are document structure, not identity evidence. They may appear
// adjacent to a real device identifier in extracted page context and must not
// invalidate that identifier by themselves.
const DOCUMENT_SECTION_HEADINGS = [
  /\btypical\s+characteristics\b/gi,
  /\belectrical\s+characteristics\b/gi,
  /\babsolute\s+maximum\s+ratings?\b/gi,
  /\brecommended\s+operating\s+conditions?\b/gi,
  /\bapplication(?:s)?\s+information\b/gi,
  /\bfunctional\s+description\b/gi
];

function semanticIdentityContext(value) {
  let context = normalized(value);
  for (const re of DOCUMENT_SECTION_HEADINGS) context = context.replace(re, ' ');
  return normalized(context);
}

export function classifyIdentifier(candidate) {
  const label = normalized(candidate?.label);
  const context = semanticIdentityContext(candidate?.context_text);
  const text = normalized(candidate?.text);

  if (PART_LABELS.has(label)) {
    const tableBound = candidate?.label_relation === 'table_header';
    const structurallyBound = tableBound || !!candidate?.label_same_line || !!candidate?.label_exclusive;
    if (tableBound) return { role: 'PART_NUMBER', demonstrated: true, reason: 'explicit_part_number_table_header' };
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
    if (/\b(?:jep|jesd|je[c]?d|iec|iso|mil[- ]std)(?:[-/ ]?\d+[A-Z0-9.-]*)?\b/i.test(context) || /\b(?:standard|std)\s+(?:number|no|#|reference|ref(?:erence)?|compliance)\b/i.test(context)) {
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
const ENGINEERING_VALUE = /[<>≤≥+\-±]?\s*\d+(?:[.,]\d+)?\s*(?:%|°?c|°?f|v|mv|kv|a|ma|ua|μa|µa|ka|hz|khz|mhz|ghz|ohm|ω|kohm|mohm|f|uf|μf|µf|nf|pf|h|uh|μh|µh|mh|w|mw|kw|va|mm|cm|m|um|μm|µm|nm|in|mil|kg|g|mg|lb|n|kn|l|ml|kb|mb|gb|bar|kpa|mpa|psi|rpm|r\/min|ms|us|μs|µs|ns|s|db|dbm|deg|degree|x)(?:$|[ ,;\/])/i;

// Valores compuestos frecuentes en fichas de PLC/control: "14 DI 24 V DC",
// "10 DO 24 V DC", "2 AI 0-10 V DC", etc. Siguen requiriendo un
// atributo técnico demostrado; no convierten texto documental en especificación.
const COMPOSITE_ENGINEERING_VALUE = /\b\d+\s*(?:DI|DO|AI|AO|I\/O|I-O)\b[\s\S]*?\b\d+(?:[.,]\d+)?\s*(?:v|mv|kv|a|ma|hz|khz|mhz|w|kw|mm|cm|bar|kpa|mpa)\b/i;
const RANGE_ENGINEERING_VALUE = /\b(?:dc|ac)?\s*\d+(?:[.,]\d+)?\s*(?:-\.\.|\.\.|-|to|a)\s*\+?\d+(?:[.,]\d+)?\s*(?:v|mv|kv|a|ma|hz|khz|mhz|w|kw|mm|cm|bar|kpa|mpa|°?c)\b/i;

// Atributos cualitativos demostrados por fichas técnicas industriales. No se
// aceptan por el texto del valor: la etiqueta exacta es la autoridad.
const DEMONSTRATED_QUALITATIVE_TECHNICAL_ATTRIBUTES = new Set([
  'valve function', 'actuation type', 'reset method', 'exhaust air function',
  'sealing principle', 'manual override', 'type of control', 'control type',
  'lap', 'operating medium', 'vibration resistance', 'shock resistance',
  'seals material', 'housing material'
]);

export function isTechnicalSpecification(attribute, value) {
  const a = normalized(attribute);
  const v = String(value || '').trim();
  if (!a || !v) return { ok: false, role: 'UNKNOWN', reason: 'missing_attribute_or_value' };

  const nonTechnical = [
    /^(?:stock|inventory|availability|available|in stock|out of stock|quantity|qty|price|cost|msrp|list price|sale price|lead time|delivery|shipping|order status|cart|sku)$/i,
    /^(?:product[ ]+folder[ ]+links?|catalog(?:[ ]+(?:number|no|#))?|military)$/i,
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
  const WEB_TECHNICAL_ATTRIBUTE = /\b(?:digital|analog|discrete|input|output|i\/o|memory|cpu|power supply|supply|voltage|current|frequency|communication|ethernet|profinet|profibus|dimensions?|temperature|operating|storage|protection|degree|rating|mounting|connector|interface|module|expansion|capacity|load|range|accuracy|resolution|material|connection|thread|port|flow|pressure|speed|torque|power)\b/i;
  if (DEMONSTRATED_QUALITATIVE_TECHNICAL_ATTRIBUTES.has(a)) {
    return { ok: true, role: 'TECHNICAL_SPECIFICATION', reason: 'demonstrated_qualitative_technical_attribute' };
  }
  if ((GENERIC_TECHNICAL_ATTRIBUTE.test(a) || WEB_TECHNICAL_ATTRIBUTE.test(a)) && (ENGINEERING_VALUE.test(v) || COMPOSITE_ENGINEERING_VALUE.test(v) || RANGE_ENGINEERING_VALUE.test(v))) {
    return { ok: true, role: 'TECHNICAL_SPECIFICATION', reason: 'technical_attribute_and_engineering_value' };
  }
  return { ok: false, role: 'UNKNOWN', reason: 'insufficient_technical_semantics' };
}
