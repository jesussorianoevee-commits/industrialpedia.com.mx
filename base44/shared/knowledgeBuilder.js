// Manufacturer Knowledge Builder — aprendizaje determinístico de part_number (sin IA/LLM/embeddings).
// Reutiliza los extractores existentes; NO crea reglas por fabricante.
//
// Flujo: candidatos (con contexto) -> pattern mining por co-ocurrencia de etiquetas/posición ->
//   grammar versionada -> validación FUERA de muestra -> promoción a ACTIVA solo si generaliza ->
//   DemonstratedFact -> Quality Gateway. Precedencia MANUAL > INDUCIDO > GENÉRICO.

// Diccionario GENÉRICO de etiquetas semánticas (no específico de fabricante).
const POSITIVE_LABELS = [
  'part number', 'part no', 'part no.', 'part #', 'p/n', 'pn', 'ordering number', 'order number', 'order no',
  'order code', 'model number', 'model no', 'device', 'product number', 'ordering', 'mpn', 'mfr part',
  'manufacturer part', 'component'
];
const NEGATIVE_LABELS = [
  'literature number', 'lit number', 'lit no', 'document number', 'doc number', 'literature', 'revision', 'rev',
  'rev.', 'date', 'family', 'package', 'lot number', 'lot no', 'serial number', 'serial no', 'catalog number',
  'cat number', 'page', 'version', 'isbn', 'ean', 'upc', 'orderable'
];
const ALL_LABELS = [...POSITIVE_LABELS, ...NEGATIVE_LABELS].sort((a, b) => b.length - a.length);

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
  if (NEGATIVE_LABELS.includes(lbl)) return 'negative';
  return 'none';
}

// Etiqueta cercana: línea actual + hasta 2 anteriores (encabezado de tabla o "Label:").
function findLabel(lines, li) {
  for (let k = 0; k <= 2; k++) {
    const idx = li - k;
    if (idx < 0) break;
    const ln = lines[idx].toLowerCase();
    for (const lbl of ALL_LABELS) {
      if (ln.includes(lbl)) return lbl;
    }
  }
  return null;
}

const ID_RE = /\b[A-Z0-9]{3,20}\b/g;

// 1. CANDIDATOS: detectar identificadores con contexto. NO adjudican significado.
export function extractCandidates(text, pages) {
  const out = [];
  const pagesArr = (Array.isArray(pages) && pages.length) ? pages : [text || ''];
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
        const label = findLabel(lines, li);
        out.push({
          text: tok, format_sig: formatSignature(tok),
          page: p + 1, line_index: li,
          label, label_type: labelTypeOf(label),
          in_title: (p === 0 && li <= 2)
        });
      }
    }
  }
  return out;
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

// 7. SELECCIÓN en ingesta. Precedencia: MANUAL(externa) > INDUCIDO(grammar activa) > directo(etiqueta positiva).
// Nunca selecciona un candidato con etiqueta negativa. Sin demostración -> no adjudica significado.
export function selectPartNumber(candidates, grammar) {
  if (!candidates || !candidates.length) return { value: '', demonstrated: false, reason: 'no_candidates', candidate: null, grammar_id: '' };
  // Directo: etiqueta positiva en el documento (el propio documento declara el part number).
  const positive = candidates.find(c => c.label_type === 'positive');
  if (positive) return { value: positive.text, demonstrated: true, reason: 'direct_positive_label', candidate: positive, grammar_id: '' };
  // INDUCIDO: grammar activa validada fuera de muestra.
  if (grammar && grammar.status === 'active' && grammar.format_sig) {
    const g = candidates.find(c => c.label_type !== 'negative' && c.format_sig === grammar.format_sig &&
      !((grammar.negative_formats || []).includes(c.format_sig)));
    if (g) return { value: g.text, demonstrated: true, reason: 'active_grammar', candidate: g, grammar_id: grammar.id || '' };
  }
  return { value: '', demonstrated: false, reason: 'not_demonstrated', candidate: null, grammar_id: (grammar && grammar.id) || '' };
}