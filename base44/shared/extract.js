// Extracción determinística de documentos industriales. Sin IA, sin LLM, sin embeddings.
// Soporta HTML y texto/CSV/JSON extraíbles de forma determinística.
// PDF binario: NO es extraíble sin un parser de texto determinístico; se marca como
// no-extraíble (el Quality Gateway lo deja en INCOMPLETE; nunca se inventa contenido).

function extractIndustrialCompactSpecs(rawText) {
  const raw = String(rawText || '');
  const specs = [];
  const patterns = [
    [/\b(\d+)\s*DI\s*([0-9.,]+\s*V\s*DC)\b/i, 'Digital inputs', (m) => `${m[1]} DI ${m[2]}`],
    [/\b(\d+)\s*DO\s*([0-9.,]+\s*V\s*DC)\b/i, 'Digital outputs', (m) => `${m[1]} DO ${m[2]}`],
    [/\b(\d+)\s*AI\s*([0-9.,]+\s*-\s*[0-9.,]+\s*V\s*DC)\b/i, 'Analog inputs', (m) => `${m[1]} AI ${m[2]}`],
    [/(?:power supply|alimentaci[oó]n|supply voltage)\s*[:\-]?\s*(?:DC\s*)?([0-9.,]+\s*[-–]\s*[0-9.,]+\s*V\s*DC)/i, 'Power supply', (m) => m[1]],
    [/(?:program\/data memory|working memory|memoria de (?:trabajo|programas\/datos))\s*[:\-]?\s*([0-9.,]+\s*(?:KB|kB|MB|GB))/i, 'Working memory', (m) => m[1]]
  ];
  for (const [re, attribute, valueFn] of patterns) {
    const match = raw.match(re);
    if (!match) continue;
    const value = valueFn(match).replace(/\s+/g, ' ').trim();
    if (value && !specs.some((s) => s.attribute === attribute && s.value === value)) specs.push({ attribute, value });
  }
  return specs;
}

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
    if (cells.length >= 2) specTable.push({ attribute: cells[0], value: cells.slice(1).join(' ') });
  }

  // Algunas fichas de fabricantes usan listas de definición en lugar de <table>.
  const dtRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  while ((m = dtRe.exec(html))) {
    const attribute = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const value = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (attribute && value) specTable.push({ attribute, value });
  }

  specTable.push(...extractIndustrialCompactSpecs(text));
  return { title, text, specTable, extractable: true };
}

export function extractPlainText(text) {
  const raw = String(text || '').trim();
  const specTable = [];
  const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  // Tavily raw_content suele llegar como Markdown. Recuperamos únicamente
  // estructuras explícitas de atributo/valor; el Quality Gateway decide después
  // si realmente son especificaciones técnicas.
  for (const line of lines) {
    const cells = line.split('|').map((x) => x.replace(/[*_`]/g, '').trim()).filter(Boolean);
    if (cells.length === 2 && !/^[-: ]+$/.test(cells[0]) && !/^[-: ]+$/.test(cells[1])) {
      const [attribute, value] = cells;
      if (attribute.length <= 100 && value.length <= 160 && /\d/.test(value)) {
        specTable.push({ attribute, value });
      }
      continue;
    }
    const m = line.replace(/^[-*]\s+/, '').match(/^([^:]{2,80})\s*:\s*(.{1,160})$/);
    if (m && /\d/.test(m[2])) specTable.push({ attribute: m[1].trim(), value: m[2].trim() });
  }

  // Fichas industriales compactas suelen concentrar varias especificaciones
  // en una sola frase, especialmente en catálogos Siemens:
  // "14 DI 24 V DC; 10 DO 24 V DC; 2 AI 0-10 V DC; power supply: DC 20.4-28.8 V DC".
  // Extraemos sólo patrones técnicos explícitos; el Quality Gateway sigue decidiendo.
  const industrialPatterns = [
    [/\b(?:onboard|integrated|integrated\s+I\/O|E\/S\s+integradas)[^:;|]*?(?:I\/O|E\/S)[^:;|]*?:?\s*(\d+)\s*DI\s*([0-9.,]+\s*V\s*DC)/i, 'Digital inputs'],
    [/\b(\d+)\s*DI\s*([0-9.,]+\s*V\s*DC)\b/i, 'Digital inputs'],
    [/\b(\d+)\s*DO\s*([0-9.,]+\s*V\s*DC)\b/i, 'Digital outputs'],
    [/\b(\d+)\s*AI\s*([0-9.,]+\s*-\s*[0-9.,]+\s*V\s*DC)\b/i, 'Analog inputs'],
    [/(?:power supply|alimentaci[oó]n|supply voltage)\s*[:\-]?\s*(?:DC\s*)?([0-9.,]+\s*[-–]\s*[0-9.,]+\s*V\s*DC)/i, 'Power supply'],
    [/(?:program\/data memory|program(?:a)?\/datos memory|memoria de (?:trabajo|programas\/datos))\s*[:\-]?\s*([0-9.,]+\s*(?:KB|kB|MB|GB))/i, 'Working memory']
  ];
  for (const [re, attribute] of industrialPatterns) {
    const m = raw.match(re);
    if (!m) continue;
    const value = m[2] ? `${m[1]} ${attribute.includes('Digital inputs') ? 'DI' : attribute.includes('Digital outputs') ? 'DO' : attribute.includes('Analog inputs') ? 'AI' : ''} ${m[2]}`.replace(/\s+/g, ' ').trim() : m[1];
    if (value && !specTable.some((s) => s.attribute === attribute && s.value === value)) {
      specTable.push({ attribute, value });
    }
  }

  specTable.push(...extractAdjacentSpecs(raw));
  return { title: '', text: raw, specTable, extractable: true };
}

// Candidato a part number (GENÉRICO conservador): primera ocurrencia en título/página 1
// de un token tipo número de parte (1-4 mayúsculas + dígito + alnum/guion). Determinístico.
export function extractPartNumber(text, title) {
  const scope = `${title || ''}\n${(text || '').slice(0, 1500)}`;
  const re = /\b[A-Z]{1,4}-?\d[A-Z0-9-]{1,12}\b/g;
  const matches = scope.match(re) || [];
  return matches[0] || '';
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

// Especificaciones compactas: "Etiqueta valor unidad" sin dos puntos, frecuentes
// en snippets de catálogos industriales ("Piston diameter 25 mm", "Stroke 25 mm",
// "Theoretical force 0.6 MPa"). Determinístico: sólo etiqueta capitalizada corta
// seguida de un valor numérico con unidad de ingeniería reconocida.
const COMPACT_UNIT_SET = new Set(['mm','cm','km','m','n','kn','bar','mpa','kpa','psi','v','mv','kv','a','ma','ua','hz','khz','mhz','w','kw','mw','va','kg','g','mg','lb','nm','µm','μm','rpm','°c','°f','%','l','ml','ms','s','db','torr','pa','mbar','bar(g)','rpm','ips','in','ft','cfm','lpm','gpm']);
const COMPACT_STOP = /^(at|with|of|in|on|for|to|en|de|para|con|por|the|a|an|y|and|or|del|la|el|las|los)$/i;
export function extractCompactSpecs(text) {
  const raw = String(text || '').replace(/\s+/g, ' ');
  const specs = [];
  // Atributo case-sensitive (empieza con mayúscula) para no consumir tokens en
  // minúscula; unidad capturada de forma amplia y validada contra un Set.
  const re = /([A-ZÀ-Ý][A-Za-zÀ-ÿ/]+(?:\s+[A-Za-zÀ-ÿ/]+){0,5}?)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Z°µ%]{1,6})\b/g;
  let m;
  while ((m = re.exec(raw))) {
    const head = m[1].trim();
    if (!head) continue;
    const words = head.split(/\s+/);
    while (words.length && COMPACT_STOP.test(words[words.length - 1])) words.pop();
    const attr = words.join(' ').trim();
    if (attr.length < 2 || attr.length > 50) continue;
    const unit = m[3].toLowerCase();
    if (!COMPACT_UNIT_SET.has(unit)) continue;
    const val = `${m[2]} ${unit}`;
    if (!specs.some((s) => s.attribute.toLowerCase() === attr.toLowerCase() && s.value === val)) {
      specs.push({ attribute: attr, value: val });
    }
  }
  return specs;
}

// Especificaciones por adyacencia: el layout más común en fichas de producto
// (web/Markdown) coloca etiqueta y valor en líneas consecutivas:
//   Payload
//   5 kg
//   Reach
//   886.5 mm
// Determinístico: sólo extrae pares que aparecen literalmente en líneas
// adyacentes. No inventa datos. Conservador: la etiqueta no contiene dígitos
// ni inicia con stop-words; el valor inicia con dígito y es corto (≤3 palabras)
// sin palabras de prosa.
const ADJACENT_LABEL_STOP = /^(specifications?|general|description|features|overview|details?|characteristics|properties|technical data|information|related products?|see also|menu|footer|copyright|all rights reserved|home|back|next|previous|share|print|download|resources?|documentation|support|contact|company|about|reviews|comments|qty|quantity|price|add to cart|buy now|in stock|out of stock|sku|model|series|brand|manufacturer|category|origin|warranty|shipping)$/i;
const ADJACENT_LABEL_PREFIX_STOP = /^(?:the|a|an|this|these|those|some|any|our|your|its|all|each|every|no|both|such|that|which|what|when|where|how|why|who|from|with|for|and|but|or|nor|so|yet)\b/i;
const ADJACENT_VALUE_STOP = /\b(?:the|a|an|with|for|and|of|to|in|is|are|includes|has|have|that|this|which|from|by|at|on|or|as|be|been|was|were|will|would|can|could|should|may|might|must|shall|do|does|did|not|no|yes)\b/i;
export function extractAdjacentSpecs(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/^[\s>*#-]+/, '').replace(/[*_`]/g, '').trim()).filter(Boolean);
  const specs = [];
  const seen = new Set();
  for (let i = 0; i < lines.length - 1; i++) {
    const label = lines[i];
    const value = lines[i + 1];
    if (label.length < 2 || label.length > 60) continue;
    if (label.split(/\s+/).length > 5) continue;
    if (/\d/.test(label)) continue;
    if (/[.!?]$/.test(label)) continue;
    if (ADJACENT_LABEL_PREFIX_STOP.test(label)) continue;
    if (ADJACENT_LABEL_STOP.test(label)) continue;
    if (value.length > 60) continue;
    if (value.split(/\s+/).length > 3) continue;
    if (!/^\d/.test(value)) continue;
    if (/[.!?]$/.test(value)) continue;
    if (ADJACENT_VALUE_STOP.test(value)) continue;
    const attr = label.replace(/[:：-]\s*$/, '').trim();
    const val = value.replace(/[,;]$/, '').trim();
    const key = `${attr.toLowerCase()}|${val.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    specs.push({ attribute: attr, value: val });
    if (specs.length >= 25) break;
  }
  return specs;
}

// Saneamiento de Markdown/URLs antes de extraer datos básicos: los snippets y
// raw_content de Tavily llegan como Markdown con links de navegación que el
// extractor confundiría con especificaciones ("[Careers](https:...").
export function stripMarkdownNoise(text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Localiza en qué página (1-based) aparece un texto; null si no se puede determinar.
export function findPageFor(needle, pages) {
  if (!Array.isArray(pages) || !needle) return null;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i] && pages[i].includes(needle)) return i + 1;
  }
  return null;
}