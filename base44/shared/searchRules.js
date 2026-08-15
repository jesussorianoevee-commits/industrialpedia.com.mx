// Reglas determinísticas de BUSCAR. Sin IA, sin SDK, sin dependencias.
// Compartidas por el backend function Buscar y BuscarTest para que la lógica
// de interpretación y ranking sea única, reproducible y verificable.

export function normalizePartNumber(s) {
  return String(s || '').toUpperCase().replace(/[\s\-/_.]/g, '');
}

// Detección determinística de número de parte / SKU.
// Token único, alfanumérico con separadores comunes, contiene dígitos, longitud razonable.
export function looksLikePartNumber(q) {
  const s = String(q || '').trim();
  if (!s) return false;
  if (/\s/.test(s)) return false;
  if (s.length < 2 || s.length > 40) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9\-/_.]*$/.test(s)) return false;
  return /\d/.test(s);
}

export function tokenize(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

// Ranking determinístico y reproducible. Mayor score = más relevante.
// Prioridad: exact part number > normalized > prefix/contains > manufacturer >
// category > description tokens > spec value.
export function scorePart(part, q, specs) {
  const raw = String(q || '').trim();
  const best = { score: 0, match: 'none' };
  if (!raw) return best;

  const qLower = raw.toLowerCase();
  const qNorm = normalizePartNumber(raw);
  const bump = (score, match) => {
    if (score > best.score) best.score = score, best.match = match;
  };

  const pn = String(part.part_number || '');
  const pnn = String(part.part_number_normalized || '');
  const mf = String(part.manufacturer_name || '').toLowerCase();
  const cat = String(part.category || '').toLowerCase();
  const desc = String(part.description || '').toLowerCase();

  if (pn && pn.toLowerCase() === qLower) bump(1000, 'part_number_exact');
  if (pnn && pnn === qNorm) bump(950, 'part_number_normalized');
  if (pn && pn.toLowerCase().startsWith(qLower)) bump(900, 'part_number_prefix');
  if (pn && pn.toLowerCase().includes(qLower)) bump(800, 'part_number_contains');

  if (mf && mf === qLower) bump(700, 'manufacturer_exact');
  if (mf && mf.includes(qLower)) bump(600, 'manufacturer_contains');

  const tokens = tokenize(raw);
  if (tokens.length) {
    const descHits = tokens.filter((t) => desc.includes(t)).length;
    const catHits = tokens.filter((t) => cat.includes(t)).length;
    const mfHits = tokens.filter((t) => mf.includes(t)).length;
    if (descHits === tokens.length) bump(500 + tokens.length, 'description_all_tokens');
    else if (descHits > 0) bump(300 + descHits, 'description_partial');
    if (catHits === tokens.length) bump(450, 'category_all_tokens');
    else if (catHits > 0) bump(250, 'category_partial');
    if (mfHits > 0) bump(200 + mfHits, 'manufacturer_token');

    if (Array.isArray(specs)) {
      const specHit = specs.some((s) => {
        const nv = String(s.normalized_value || '').toLowerCase();
        return tokens.some((t) => nv === t || nv === t.replace(/v$/, ''));
      });
      if (specHit) bump(400, 'spec_value');
    }
  }
  return best;
}

// Comparador reproducible: score desc, luego part_number asc.
export function rankComparator(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return String(a.part.part_number || '').localeCompare(String(b.part.part_number || ''));
}