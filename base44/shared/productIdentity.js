// Capa de identidad de producto derivada de evidencia real.
// No usa el título comercial (Amazon, marketplaces, SEO) como identidad principal.
// Determinística: sin IA, sin LLM.
//
// Prioridad de PN/modelo:
//   1. PN explícito en la fuente (etiqueta "Part number:", "Model:", etc.)
//   2. PN/modelo extraído del título (patrón estructural)
//   3. PN/modelo extraído del contenido técnico
//   4. Hint manual (consulta del usuario o extracción previa)
//
// Si no hay confianza suficiente → "Producto no identificado".
// Si hay múltiples variantes → se listan, no se elige una arbitrariamente.

import { normalizePartNumber } from './normalize.js';

const KNOWN_MANUFACTURERS = [
  'Festo', 'Siemens', 'SMC', 'Balluff', 'Keyence', 'Omron', 'Phoenix Contact',
  'Schneider Electric', 'Rockwell Automation', 'Allen-Bradley', 'Mitsubishi',
  'Yaskawa', 'Pepperl+Fuchs', 'Turck', 'ifm electronic', 'Sick', 'Eaton',
  'ABB', 'Honeywell', 'Bosch', 'Pilz', 'Beckhoff', 'Delta', 'Lenze', 'SEW',
  'Bürkert', 'Norgren', 'Camozzi', 'Aventics', 'Parker', 'Bimba',
  'Misumi', 'Igus', 'Schunk', 'Zimmer', 'Murr', 'Murrelektronik',
  'Hirschmann', 'Harting', 'Weidmüller', 'Wago', 'Molex', 'TE Connectivity',
  'Tyco', 'Phoenix', 'Leuze', 'Baumer', 'Contrinex', 'Rechner'
];

// Etiquetas que indican explícitamente un número de parte/modelo en el contenido.
const PN_LABEL_RE = /\b(?:part\s*(?:number|no\.?|#)|p\/n|pn|model\s*(?:number|no\.?)?|mpn|mfr\.?\s*part|manufacturer\s*part|order(?:ing)?\s*(?:number|no\.?|code)|article\s*(?:number|no\.?)|art\.?\s*nr\.?|bestellnr\.?|artikelnummer)\s*[:：]\s*([A-Za-z0-9][A-Za-z0-9\-\/.]{2,30})/gi;

// Patrón estructural de PN: 1-4 mayúsculas + dígito + alnum/guion.
const PN_STRUCTURAL_RE = /\b([A-Z]{1,4}-?\d[A-Z0-9\-]{1,18})\b/g;

const MARKETPLACE_DOMAINS = /(?:amazon|ebay|mercadolibre|aliexpress|alibaba|walmart|shopify|etsy|shop\.|store\.|marketplace|classifieds)/i;

const CATEGORY_PATTERNS = [
  { type: 'cylinder', label: 'Cilindro', re: /\b(?:cili?ndro|cylinder|pneumatic\s+cylind|hydraulic\s+cylind|actuador\s+lineal|linear\s+actuator|DSNU|ADN|ADVU|DGO|carrera|stroke)\b/i },
  { type: 'sensor', label: 'Sensor', re: /\b(?:sensor|inductive|capacitive|photoelectric|magnetic|proximity|detector|inductivo|capacitivo|fot[oó]electrico|proximidad|BES|BNS)\b/i },
  { type: 'valve', label: 'Válvula', re: /\b(?:valve|v[áa]lvula|solenoid|electrov|directional|solenoide)\b/i },
  { type: 'plc', label: 'PLC / Controlador', re: /\b(?:plc|controller|controlador|cpu|6ES7|6AV|6EP|simatic)\b/i },
  { type: 'motor', label: 'Motor', re: /\b(?:motor|servomotor|stepper|paso\s+a\s+paso|drive|inverter|frequency\s+converter|servo)\b/i },
  { type: 'bearing', label: 'Rodamiento', re: /\b(?:bearing|rodamiento|ball\s+bearing|roller|angular\s+contact)\b/i },
  { type: 'connector', label: 'Conector', re: /\b(?:connector|conector|terminal\s+block|regleta|faston|m12|m8|rj45|harting|heavycon|pin\s+header)\b/i },
  { type: 'relay', label: 'Relé', re: /\b(?:relay|rel[eé]|contactor|timer|temporalizador)\b/i },
  { type: 'power_supply', label: 'Fuente de alimentación', re: /\b(?:power\s+supply|fuente\s+de\s+alimentaci[oó]n|psu|dc\s+converter|ac\s+adapter|dcdc)\b/i },
  { type: 'fitting', label: 'Conexión neumática', re: /\b(?:fitting|conexi[oó]n\s+neum[áa]tica|raccordo|push[- ]in|push[- ]to[- ]connect)\b/i },
  { type: 'gripper', label: 'Pinza', re: /\b(?:gripper|pinza|garra)\b/i },
  { type: 'cable', label: 'Cable', re: /\b(?:cable|conductor|harness|wiring)\b/i }
];

function detectProductCategory(text) {
  const corpus = String(text || '');
  for (const c of CATEGORY_PATTERNS) {
    if (c.re.test(corpus)) return { type: c.type, label: c.label };
  }
  return { type: 'general', label: 'Componente industrial' };
}

function isMarketplaceSource(url) {
  try { return MARKETPLACE_DOMAINS.test(new URL(url).hostname); } catch { return false; }
}

function extractAllPartNumbers(text) {
  const matches = String(text || '').match(PN_STRUCTURAL_RE) || [];
  const seen = new Set();
  const result = [];
  for (const m of matches) {
    const norm = normalizePartNumber(m);
    if (!seen.has(norm)) { seen.add(norm); result.push(m); }
  }
  return result;
}

function extractLabeledPartNumbers(text) {
  const results = [];
  let m;
  const re = new RegExp(PN_LABEL_RE.source, 'gi');
  while ((m = re.exec(String(text || '')))) results.push(m[1].trim());
  return [...new Set(results)];
}

function normalizeBrand(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function identifyManufacturer(query, content, hint) {
  // Only accept hint if it matches a known manufacturer AND appears in the content.
  // This prevents fragments like "neum" (from "neumático") or "lvula" (from
  // "válvula") from being used as a manufacturer name, and ensures the
  // manufacturer is backed by explicit evidence in the source itself.
  const text = String(content || '').toLowerCase();
  if (hint && hint.trim()) {
    const hintNorm = normalizeBrand(hint);
    if (hintNorm && hintNorm.length >= 3) {
      const exact = KNOWN_MANUFACTURERS.find((m) => normalizeBrand(m) === hintNorm);
      if (exact && text.includes(exact.toLowerCase())) return exact;
      const partial = KNOWN_MANUFACTURERS.find((m) => normalizeBrand(m).includes(hintNorm) || hintNorm.includes(normalizeBrand(m)));
      if (partial && text.includes(partial.toLowerCase())) return partial;
    }
  }
  // Detect from content only — never from the query text. The query is the
  // user's search, not evidence in the source. A manufacturer must appear in
  // the content to be attributed to a product.
  for (const m of KNOWN_MANUFACTURERS) {
    if (text.includes(m.toLowerCase())) return m;
  }
  return '';
}

export function deriveProductIdentity({ title, text, query, manufacturer_hint, part_number_hint, source_url, component_type, component_type_label }) {
  const sourceTitle = String(title || '').trim();
  const fullContent = `${sourceTitle}\n${String(text || '')}`;
  const isMarketplace = isMarketplaceSource(source_url);

  // 1) Part Number: hint > etiqueta explícita > título.
  //    No se extraen PNs del contenido libre: los datasheets contienen números de
  //    referencia, estándares, normas y productos cruzados que no constituyen
  //    evidencia de identidad del producto mostrado en la página. Aceptarlos
  //    sin discriminación generaba PNs falsos en la ficha.
  const allPns = [];
  const seenNorm = new Set();
  const addPn = (pn) => {
    const norm = normalizePartNumber(pn);
    if (norm && !seenNorm.has(norm)) { seenNorm.add(norm); allPns.push(pn); }
  };
  if (part_number_hint && part_number_hint.trim()) addPn(part_number_hint.trim());
  extractLabeledPartNumbers(fullContent).forEach(addPn);
  extractAllPartNumbers(sourceTitle).forEach(addPn);
  const partNumbers = allPns.slice(0, 5);

  // 2) Manufacturer
  const manufacturer = identifyManufacturer(query, fullContent, manufacturer_hint);

  // 3) Product category
  const typeCorpus = `${sourceTitle} ${(partNumbers[0] || '')} ${manufacturer} ${String(text || '').slice(0, 500)} ${query || ''}`;
  const category = (component_type && component_type_label)
    ? { type: component_type, label: component_type_label }
    : detectProductCategory(typeCorpus);

  // 4) Confidence: need at least PN or (manufacturer + category that isn't 'general')
  const hasPN = partNumbers.length > 0;
  const hasManufacturer = Boolean(manufacturer);
  const hasCategory = category.type !== 'general';
  const identified = hasPN || (hasManufacturer && hasCategory);

  // 5) Short description: manufacturer + category + PN (no SEO title).
  //    If only category is detected (no manufacturer, no PN), show the category
  //    rather than the SEO title — it's still more informative than "no identificado".
  let shortDescription = '';
  if (partNumbers.length === 1) {
    const parts = [];
    if (manufacturer) parts.push(manufacturer);
    if (hasCategory) parts.push(category.label);
    parts.push(partNumbers[0]);
    shortDescription = parts.filter(Boolean).join(' ');
  } else if (partNumbers.length > 1) {
    const parts = [];
    if (manufacturer) parts.push(manufacturer);
    if (hasCategory) parts.push(category.label);
    shortDescription = `${parts.join(' ')} · ${partNumbers.length} variantes`.trim();
  } else if (manufacturer && hasCategory) {
    shortDescription = `${manufacturer} ${category.label}`;
  } else if (manufacturer) {
    shortDescription = manufacturer;
  } else if (hasCategory) {
    shortDescription = category.label;
  } else {
    shortDescription = 'Producto no identificado';
  }

  // 6) Variants: if multiple PNs found, list them — don't pick one arbitrarily.
  const variants = partNumbers.length > 1 ? partNumbers : [];

  return {
    manufacturer,
    part_number: partNumbers[0] || '',
    part_numbers: partNumbers,
    product_category: category.type,
    product_category_label: category.label,
    short_description: shortDescription,
    identified,
    variants,
    source_title: sourceTitle,
    is_marketplace: isMarketplace
  };
}