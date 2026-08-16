// Extracción determinística de documentos industriales. Sin IA, sin LLM, sin embeddings.
// Soporta HTML y texto/CSV/JSON extraíbles de forma determinística.
// PDF binario: NO es extraíble sin un parser de texto determinístico; se marca como
// no-extraíble (el Quality Gateway lo deja en INCOMPLETE; nunca se inventa contenido).

export function extractHTML(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].trim()
    || (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1].trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  // Tablas de especificaciones: filas <tr> con exactamente 2 celdas (atributo, valor).
  const specTable = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html))) {
    const cells = (m[1].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
      .map((c) => c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (cells.length === 2) specTable.push({ attribute: cells[0], value: cells[1] });
  }
  return { title, text, specTable, extractable: true };
}

export function extractPlainText(text) {
  return { title: '', text: String(text || '').trim(), specTable: [], extractable: true };
}

// Candidato a part number: token alfanumérico con dígitos y letras, 4-24 chars.
// Determinístico (regex), no heurístico de IA.
export function extractPartNumber(text, title) {
  const blob = `${title || ''} ${text || ''}`;
  const cand = blob.match(/[A-Z0-9][A-Z0-9\-/.]{3,23}/gi) || [];
  const best = cand
    .filter((s) => /\d/.test(s) && /[A-Za-z]/.test(s))
    .filter((s) => !/^(http|https|www|html|pdf|json|csv)$/i.test(s))
    .sort((a, b) => b.length - a.length);
  return best[0] || '';
}

// Extracción de especificaciones desde texto plano (PDF/CSV-like). Determinística y conservadora:
// sólo líneas "Etiqueta: valor con dígito" con etiqueta corta (<=6 palabras). No inventa datos.
export function extractTextSpecs(text) {
  const specs = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.length > 140) continue;
    const m = t.match(/^(.{2,55}?)\s*[:：]\s*([^\n:]{1,45})$/);
    if (!m) continue;
    const label = m[1].trim();
    const val = m[2].trim();
    if (!/\d/.test(val)) continue;
    if (label.split(/\s+/).length > 6) continue;
    specs.push({ attribute: label, value: val });
  }
  return specs;
}

// Localiza en qué página (1-based) aparece un texto; null si no se puede determinar.
export function findPageFor(needle, pages) {
  if (!Array.isArray(pages) || !needle) return null;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i] && pages[i].includes(needle)) return i + 1;
  }
  return null;
}