import { classifyIdentifier } from './semanticResolver.js';

// Manufacturer Knowledge Builder — aprendizaje determinístico de part_number (sin IA/LLM/embeddings).
// Reutiliza los extractores existentes; NO crea reglas por fabricante.
//
// Flujo: candidatos (con contexto) -> pattern mining por co-ocurrencia de etiquetas/posición ->
//   grammar versionada -> validación FUERA de muestra -> promoción a ACTIVA solo si generaliza ->
//   DemonstratedFact -> Quality Gateway. Precedencia MANUAL > INDUCIDO > GENÉRICO.

// Diccionario GENÉRICO de etiquetas semánticas (no específico de fabricante).
const STRONG_PART_NUMBER_LABELS = [
  'part number', 'part no', 'part no.', 'part #', 'p/n', 'pn', 'ordering number', 'order number', 'order no',
  'order code', 'model number', 'model no', 'product number', 'ordering', 'mpn', 'mfr part',
  'manufacturer part'
];

// Contextual labels are evidence, not an automatic PART_NUMBER decision.
// A generic word such as "device" or "component" must be corroborated by document context.
const CONTEXTUAL_IDENTIFIER_LABELS = ['device', 'component'];
const POSITIVE_LABELS = [...STRONG_PART_NUMBER_LABELS];
const NEGATIVE_LABELS = [
  'literature number', 'lit number', 'lit no', 'document number', 'doc number', 'literature', 'revision', 'rev',
  'rev.', 'date', 'family', 'package', 'lot number', 'lot no', 'serial number', 'serial no', 'catalog number',
  'cat number', 'page', 'version', 'isbn', 'ean', 'upc', 'orderable'
];
const ALL_LABELS = [...POSITIVE_LABELS, ...CONTEXTUAL_IDENTIFIER_LABELS, ...NEGATIVE_LABELS].sort((a, b) => b.length - a.length);

export function formatSignature(token) {
  let sig = '';
  for (const ch of String(token || '')) {
    if (/[A-Z]/.test(ch)) sig += 'A';
    else if (/[0-9]/.test(ch)) sig += 'N';
    else sig += ch;
  }
  return sig;
}

function labelTypeOf(lbl) {
  if (!lbl) return 'none';
  if (POSITIVE_LABELS.includes(lbl)) return 'positive';
  if (CONTEXTUAL_IDENTIFIER_LABELS.includes(lbl)) return 'contextual';
  if (NEGATIVE_LABELS.includes(lbl)) return 'negative';
  return 'none';
}

// Etiqueta estructuralmente segura. Una etiqueta fuerte solo demuestra el rol si:
// - aparece en la misma línea que el candidato, o
// - la línea inmediatamente anterior contiene SOLO esa etiqueta.
// Nunca se hereda una etiqueta desde un encabezado de tabla con varias columnas.
function findLabelEvidence(lines, li) {
  const same = String(lines[li] || '');
  const previous = li > 0 ? String(lines[li - 1] || '') : '';
  const candidates = [];
  for (const lbl of ALL_LABELS) {
    const escaped = lbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?:^|[^a-z0-9])' + escaped + '(?:$|[^a-z0-9])', 'i');
    if (re.test(same)) candidates.push({ label: lbl, sameLine: true, distance: 0, exclusive: false });
    const prevTrim = previous.trim().replace(/[：:]\s*$/, '').trim();
    if (re.test(previous) && prevTrim.toLowerCase() === lbl.toLowerCase()) {
      candidates.push({ label: lbl, sameLine: false, distance: 1, exclusive: true });
    }
  }
  return candidates.sort((a, b) => (Number(b.sameLine) - Number(a.sameLine)) || (Number(b.exclusive) - Number(a.exclusive)) || (b.label.length - a.label.length))[0] || null;
}

// Conservador con símbolos de ingeniería habituales en MPNs. El resolver semántico
// decide si el candidato es realmente PART_NUMBER; ampliar la captura no autoriza publicación.
const ID_RE = /\b[A-Z0-9][A-Z0-9._\/-]{2,29}\b/g;

// 1. CANDIDATOS: detectar identificadores con contexto. NO adjudican significado.
function extractTableBoundCandidates(tables = []) {
  const out = [];
  for (const table of Array.isArray(tables) ? tables : []) {
    for (const row of Array.isArray(table.rows) ? table.rows : []) {
      const partCell = row.find((cell) => cell?.header === 'PART_NUMBER');
      if (!partCell || partCell.is_header) continue;
      ID_RE.lastIndex = 0;
      const matches = String(partCell.text || '').match(ID_RE) || [];
      for (const tok of matches) {
        if (!/\d/.test(tok) || !/[A-Za-z]/.test(tok)) continue;
        const contextText = row.map((c) => c?.text || '').join(' ').replace(/\s+/g, ' ').trim();
        out.push({
          text: tok,
          format_sig: formatSignature(tok),
          page: Number(table.page) || null,
          line_index: row[0]?.row_index ?? null,
          label: 'part number',
          label_type: 'positive',
          label_same_line: false,
          label_distance: 0,
          label_exclusive: false,
          label_relation: 'table_header',
          context_text: contextText,
          part_marking: String(row.find((c) => c?.header === 'PART_MARKING')?.text || '').trim(),
          bbox: partCell.bbox || null,
          in_title: false,
          table_id: table.id || '',
          row_index: partCell.row_index ?? null,
          column_index: partCell.column_index ?? null
        });
      }
    }
  }
  return out;
}

export function extractCandidates(text, pages, layoutBlocks = [], tables = []) {
  const out = extractTableBoundCandidates(tables);
  const pagesArr = (Array.isArray(pages) && pages.length) ? pages : [text || ''];
  const blockByPageText = new Map();
  for (const b of Array.isArray(layoutBlocks) ? layoutBlocks : []) {
    const key = `${Number(b.page) || 0}|${String(b.text || '').replace(/\s+/g, ' ').trim()}`;
    if (key !== '|') blockByPageText.set(key, b);
  }
  for (let p = 0; p < pagesArr.length; p++) {
    const lines = String(pagesArr[p] || '').split(/\r?\n/);
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const seen = new Set();
      ID_RE.lastIndex = 0;
      let m;
      while ((m = ID_RE.exec(line))) {
        const tok = m[0];
        if (seen.has(tok)) continue;
        seen.add(tok);
        if (!/\d/.test(tok) || !/[A-Za-z]/.test(tok)) continue;
        const labelEvidence = findLabelEvidence(lines, li);
        const label = labelEvidence?.label || null;
        const contextLines = lines.slice(Math.max(0, li - 2), Math.min(lines.length, li + 3));
        out.push({
          text: tok, format_sig: formatSignature(tok),
          page: p + 1, line_index: li,
          label, label_type: labelTypeOf(label),
          label_same_line: !!labelEvidence?.sameLine,
          label_distance: labelEvidence?.distance ?? null,
          label_exclusive: !!labelEvidence?.exclusive,
          context_text: contextLines.join(' ').replace(/\s+/g, ' ').trim(),
          bbox: blockByPageText.get(`${p + 1}|${String(line || '').replace(/\s+/g, ' ').trim()}`)?.bbox || null,
          in_title: (p === 0 && li <= 2)
        });
      }
    }
  }
  const seen = new Set();
  return out.filter((c) => {
    const key = `${c.page}|${c.text}|${c.bbox?.x0}|${c.bbox?.y0}|${c.label_relation || 'line'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function modeKey(counts) {
  const e = Object.entries(counts).sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))[0];
  return e ? e[0] : null;
}

function simpleHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// 2-5. INDUCCIÓN + VALIDACIÓN FUERA DE MUESTRA.
// docs: [{ doc_id, candidates: [...] }, ...]  (se ordena por doc_id de forma determinística).
// El split es determinista (60% inducción / 40% validación por orden de doc_id).
export function induceGrammar(docs) {
  const sorted = [...docs].sort((a, b) => (a.doc_id < b.doc_id ? -1 : 1));
  const n = sorted.length;
  const splitIdx = Math.max(1, Math.ceil(n * 0.6));
  const induction = sorted.slice(0, splitIdx);
  const validation = sorted.slice(splitIdx);

  const posFormats = {}, negFormats = {};
  const posLabels = new Set(), negLabels = new Set();
  let posDocs = 0;
  for (const d of induction) {
    let hasPos = false;
    for (const c of d.candidates) {
      if (c.label_type === 'positive') { posFormats[c.format_sig] = (posFormats[c.format_sig] || 0) + 1; posLabels.add(c.label); hasPos = true; }
      if (c.label_type === 'negative') { negFormats[c.format_sig] = (negFormats[c.format_sig] || 0) + 1; negLabels.add(c.label); }
    }
    if (hasPos) posDocs++;
  }

  const selector = posDocs >= Math.ceil(induction.length * 0.5) ? 'positive_label' : 'title_format';
  let formatSig = null;
  if (selector === 'positive_label') {
    formatSig = modeKey(posFormats);
  } else {
    const titleF = {};
    for (const d of induction) for (const c of d.candidates) if (c.in_title && c.label_type !== 'negative') titleF[c.format_sig] = (titleF[c.format_sig] || 0) + 1;
    formatSig = modeKey(titleF);
  }
  const negativeFormats = Object.keys(negFormats);

  // Validación fuera de muestra: aplicar SOLO el formato inducido (no la etiqueta) y confirmar
  // con la etiqueta INDEPENDIENTE del documento de validación. Sin score probabilístico.
  let tp = 0, fp = 0, fn = 0;
  const pendingObs = [];
  for (const d of validation) {
    const sel = d.candidates.find(c => c.label_type !== 'negative' && c.format_sig === formatSig) || null;
    if (!sel) { fn++; continue; }
    if (sel.label_type === 'positive') tp++;
    else if (sel.label_type === 'negative') fp++;
    else { fn++; pendingObs.push({ doc_id: d.doc_id, candidate: sel, missing_link: 'no_positive_label_in_validation' }); }
  }

  const status = (validation.length > 0 && fp === 0 && tp > 0) ? 'active' : 'pending';
  const hash = simpleHash([selector, formatSig || '', negativeFormats.join(','),
    induction.map(d => d.doc_id).join(','), validation.map(d => d.doc_id).join(',')].join('|'));

  return {
    selector, format_sig: formatSig || '', negative_formats: negativeFormats,
    positive_labels: [...posLabels], negative_labels: [...negLabels],
    induction_doc_ids: induction.map(d => d.doc_id),
    validation_doc_ids: validation.map(d => d.doc_id),
    tp, fp, fn, status,
    coverage: `${tp}/${validation.length} confirmados en validacion, ${fp} FP, ${fn} FN`,
    hash, pending_observations: pendingObs
  };
}

function hasExcludedContext(candidate) {
  const r = classifyIdentifier(candidate);
  return !r.demonstrated && ['ELECTRICAL_VALUE', 'VOLTAGE_REFERENCE', 'STANDARD_REFERENCE', 'DOCUMENT_REFERENCE', 'REVISION', 'PACKAGE', 'LITERATURE_NUMBER'].includes(r.role);
}

function contextualPartCandidate(candidates) {
  const eligible = candidates.filter((c) => {
    if (c.label_type === 'negative') return false;
    const role = classifyIdentifier(c).role;
    if (!['IDENTIFIER_CANDIDATE', 'UNKNOWN'].includes(role)) return false;
    if (hasExcludedContext(c)) return false;
    return c.label_type === 'contextual' || /\b(?:devices?|components?|parts?|products?|models?|amplifiers?|sensors?|controllers?|regulators?|drivers?|converters?|switches?|relays?|motors?|actuators?|valves?|modules?|processors?|interfaces?)\b/i.test(String(c.context_text || ''));
  });
  if (!eligible.length) return null;
  const byToken = new Map();
  for (const c of eligible) {
    const key = c.text;
    const prev = byToken.get(key) || { candidate: c, firstPageCount: 0 };
    if (c.page === 1) prev.firstPageCount++;
    byToken.set(key, prev);
  }
  // Contextual labels require corroboration from independent document regions:
  // at least two eligible occurrences on page 1 plus either a title occurrence
  // or a non-excluded occurrence of the same token outside page 1.
  const documentOccurrences = new Map();
  for (const c of candidates) {
    const role = classifyIdentifier(c).role;
    if (['ELECTRICAL_VALUE', 'VOLTAGE_REFERENCE', 'STANDARD_REFERENCE', 'DOCUMENT_REFERENCE', 'REVISION', 'PACKAGE', 'LITERATURE_NUMBER'].includes(role)) continue;
    const key = c.text;
    const pages = documentOccurrences.get(key) || new Set();
    if (c.page && c.page !== 1) pages.add(c.page);
    documentOccurrences.set(key, pages);
  }
  return [...byToken.entries()]
    .map(([key, x]) => ({ ...x, outsidePageCount: documentOccurrences.get(key)?.size || 0 }))
    .filter((x) => x.firstPageCount >= 2 && (x.candidate.in_title || x.outsidePageCount >= 1))
    .sort((a, b) => (Number(b.candidate.in_title) - Number(a.candidate.in_title)) || (b.firstPageCount - a.firstPageCount) || (a.candidate.text < b.candidate.text ? -1 : 1))[0]?.candidate || null;
}

// Selección multi-Part para tablas de ordenamiento.
// Una fila de una tabla con header PART_NUMBER representa un SKU/Part distinto.
// No usa frecuencia ni popularidad y no altera el selector legado de documentos monocomponente.
export function selectPartNumbers(candidates, grammar) {
  const tableCandidates = (candidates || []).filter((c) => c.label_relation === 'table_header');
  if (!tableCandidates.length) return [];

  const rows = new Map();
  for (const c of tableCandidates) {
    // table_id is scoped to each PDF page because detectTables() runs per page.
    // Include page so identical table_id/row_index pairs on different pages are distinct rows.
    const key = `${c.page ?? ''}|${c.table_id || ''}|${c.row_index ?? c.line_index ?? ''}`;
    const row = rows.get(key) || [];
    row.push(c);
    rows.set(key, row);
  }

  const selected = [];
  for (const rowCandidates of rows.values()) {
    const unique = [...new Map(rowCandidates.map((c) => [normalizePartKey(c.text), c])).values()];
    if (unique.length !== 1) continue; // fila ambigua: no adjudicar un SKU por azar.
    const candidate = unique[0];
    const semantic = classifyIdentifier(candidate);
    if (semantic.role === 'PART_NUMBER' || (candidate.label_type === 'positive' && candidate.label_relation === 'table_header')) {
      selected.push({
        value: candidate.text,
        demonstrated: true,
        reason: 'explicit_part_number_table_header',
        role: 'PART_NUMBER',
        candidate,
        grammar_id: ''
      });
    }
  }

  const seen = new Set();
  return selected.filter((s) => {
    const key = normalizePartKey(s.value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePartKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function versionTokens(text) {
  const out = [];
  const re = /\b((?:BA|KA|B|A|K)(?:\s*,\s*(?:BA|KA|B|A|K))*)\s+versions?\b/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    for (const token of m[1].split(',')) out.push(token.trim().toUpperCase());
  }
  return [...new Set(out)];
}

function partMarkingMatchesVersion(marking, version, partNumber = '') {
  const m = String(marking || '').toUpperCase().replace(/\s+/g, '');
  const p = String(partNumber || '').toUpperCase().replace(/\s+/g, '');
  if (!m && !p) return false;

  // A marking may carry package/suffix characters after the grade (e.g. LM324BIDR),
  // so a simple token-boundary test is insufficient. Prefer the explicit Part Number
  // when available: detect the grade immediately after the alphanumeric family stem.
  // This is evidence from the orderable row itself, not a manufacturer-specific rule.
  if (p) {
    const grade = String(version || '').toUpperCase();
    // Read the grade immediately after the numeric family stem. Order multi-letter
    // grades first so BA/KA are not misread as B/K.
    const match = p.match(/[0-9](BA|KA|B|A|K)(?:[A-Z0-9._\\/-]*)$/i);
    if (match && match[1].toUpperCase() === grade) return true;
  }

  // Fallback for a marking that explicitly exposes the grade as a separated token.
  return new RegExp(`(?:^|[^A-Z0-9])${version}(?:$|[^A-Z0-9])`, 'i').test(m)
    || new RegExp(`${version}$`, 'i').test(m);
}

// Determina aplicabilidad únicamente cuando el documento aporta una relación explícita:
// 1) la spec menciona directamente el Part Number, o
// 2) la spec declara una versión (B/BA/K/KA/A) y la fila de ordering aporta Part marking
//    que demuestra ese mismo grado. Sin evidencia explícita, la spec NO se copia a un Part.
export function selectSpecificationsForPart(specs, partCandidate) {
  const partNumber = normalizePartKey(partCandidate?.text);
  const marking = String(partCandidate?.part_marking || '').trim();
  return (specs || []).filter((spec) => {
    const corpus = `${spec.attribute_name || ''} ${spec.original_value || ''} ${spec.evidence_context || ''}`;
    if (partNumber && normalizePartKey(corpus).includes(partNumber)) return true;
    const versions = versionTokens(corpus);
    if (!versions.length) return false;
    return versions.some((v) => partMarkingMatchesVersion(marking, v, partNumber));
  });
}

// 7. SELECCIÓN en ingesta. Precedencia: MANUAL > INDUCIDO > explícito > contextual corroborado.
// Un candidato por sí solo nunca adjudica significado; sin demostración se mantiene pendiente.
export function selectPartNumber(candidates, grammar) {
  if (!candidates || !candidates.length) return { value: '', demonstrated: false, reason: 'no_candidates', candidate: null, grammar_id: '' };

  // 1) Explicit label: the semantic resolver must independently agree that the label
  // denotes PART_NUMBER. This prevents accidental positive-label promotion.
  const explicit = candidates.find((c) => classifyIdentifier(c).role === 'PART_NUMBER' && !hasExcludedContext(c));
  if (explicit) {
    const explicitRole = classifyIdentifier(explicit);
    return { value: explicit.text, demonstrated: true, reason: explicitRole.reason, role: 'PART_NUMBER', candidate: explicit, grammar_id: '' };
  }

  // 2) Active grammar is allowed only after the candidate passes semantic exclusion checks.
  if (grammar && grammar.status === 'active' && grammar.format_sig) {
    const g = candidates.find((c) => c.label_type !== 'negative' && c.format_sig === grammar.format_sig && !hasExcludedContext(c));
    if (g) {
      const role = classifyIdentifier(g);
      if (role.role === 'IDENTIFIER_CANDIDATE' || role.role === 'UNKNOWN') {
        return { value: g.text, demonstrated: true, reason: 'active_grammar', role: 'PART_NUMBER', candidate: g, grammar_id: grammar.id || '' };
      }
    }
  }

  // 3) Contextual identity requires corroboration and is still deterministic.
  const contextual = contextualPartCandidate(candidates);
  if (contextual) return { value: contextual.text, demonstrated: true, reason: 'contextual_identity_corroborrated', role: 'PART_NUMBER', candidate: contextual, grammar_id: '' };

  return { value: '', demonstrated: false, reason: 'not_demonstrated', role: 'UNKNOWN', candidate: null, grammar_id: (grammar && grammar.id) || '' };
}