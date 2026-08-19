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
    const pnTokenHits = tokens.filter((t) => pn.toLowerCase().includes(t) || pnn.includes(normalizePartNumber(t))).length;
    const descHits = tokens.filter((t) => desc.includes(t)).length;
    const catHits = tokens.filter((t) => cat.includes(t)).length;
    const mfHits = tokens.filter((t) => mf.includes(t)).length;
    const fieldHits = tokens.filter((t) =>
      pn.toLowerCase().includes(t) || pnn.includes(normalizePartNumber(t)) ||
      mf.includes(t) || cat.includes(t) || desc.includes(t)
    ).length;
    if (fieldHits === tokens.length) bump(650 + tokens.length * 5, 'all_query_tokens');
    else if (pnTokenHits > 0) bump(550 + pnTokenHits * 10, 'part_number_token');
    if (descHits === tokens.length) bump(500 + tokens.length, 'description_all_tokens');
    else if (descHits > 0) bump(300 + descHits, 'description_partial');
    if (catHits === tokens.length) bump(450, 'category_all_tokens');
    else if (catHits > 0) bump(250, 'category_partial');
    if (mfHits > 0) bump(200 + mfHits, 'manufacturer_token');

    if (Array.isArray(specs)) {
      const specHits = specs.reduce((count, s) => {
        const attr = String(s.attribute_canonical || s.attribute_name || '').toLowerCase();
        const value = String(s.normalized_value || s.original_value || '').toLowerCase();
        const unit = String(s.normalized_unit || s.original_unit || '').toLowerCase();
        const text = `${attr} ${value} ${unit}`;
        return count + (tokens.some((t) => text.includes(t)) ? 1 : 0);
      }, 0);
      if (specHits > 0) bump(400 + Math.min(specHits, 10), 'specification_text');
    }
  }
  return best;
}

// Filtro de relevancia para registros de DiscoveryIndex. Un registro persistido
// puede tener datos contaminados (fabricante mal derivado, fuente no industrial).
// Este filtro rechaza fuentes claramente no industriales (marketplaces, sitios de
// música/películas, redes sociales) y contenido no industrial sin contexto técnico.
// Es generalizable: no depende de un fabricante o producto concreto.
const NON_INDUSTRIAL_HOSTS = /(?:^|[.])(amazon|ebay|mercadolibre|aliexpress|alibaba|walmart|temu|wish|etsy|imslp|youtube|youtu\.be|vimeo|facebook|instagram|tiktok|twitter|x\.com|linkedin|reddit|quora|pinterest|blogspot|wordpress|medium|wikipedia|wikimedia|indeed|glassdoor|stackoverflow|stackexchange|pinterest)(?:[.]|$)/i;
const NON_INDUSTRIAL_CONTENT = /(?:recipe|receta|food|comida|restaurant|restaurante|movie|pelicula|pelicula|music|musica|song|cancion|shoes?|zapatos?|clothing|ropa|fashion|cosmetics?|maquillaje|smartphone|iphone|gaming|video game|hotel|travel|turismo|viajes?|sports?|deportes?|celebrity|celebridad|crypto|loteria|lottery|juegos?|games?|boleros?\b|dances?|for orchestra|composition)/i;

export function isLikelyIndustrialSource(url, title, description) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch {}
  if (host && NON_INDUSTRIAL_HOSTS.test(host)) return false;
  const text = `${title || ''} ${description || ''}`;
  if (NON_INDUSTRIAL_CONTENT.test(text) && !INDUSTRIAL_CONTEXT_TERMS.test(text)) return false;
  return true;
}

// Gate determinístico de consultas no industriales. Una consulta claramente
// no industrial (recetas, música, películas, moda, etc.) no debe producir
// resultados del Knowledge Core ni del DiscoveryIndex, aunque registros viejos
// de discovery tengan el texto de la consulta contaminando sus descripciones.
// Es generalizable: no depende de un fabricante o producto concreto. Si la
// consulta tiene contexto industrial explícito, no se considera no-industrial.
const NON_INDUSTRIAL_QUERY_TERMS = /(?:recipe|receta|food|comida|restaurant|restaurante|cocina|movie|pelicula|película|film|music|musica|música|song|cancion|canción|shoes?|zapatos?|clothing|ropa|fashion|cosmetics?|maquillaje|smartphone|iphone|ipad|gaming|video game|hotel|travel|turismo|viajes?|sports?|deportes?|celebrity|celebridad|crypto|cryptocurrency|loteria|lottery|juegos?|games?|pizza|hamburguesa|tacos?|futbol|fútbol|basketball|tenis|beisbol|béisbol)/i;
const INDUSTRIAL_CONTEXT_TERMS = /(?:industrial|automation|automatizacion|automatización|manufacturing|factory|fabrica|fábrica|electrical|electrico|electrónica|electronics|electronica|pneumatic|neumatic|neumático|hydraulic|hidraulic|hidráulico|sensor|valve|valvula|válvula|actuator|motor|bearing|rodamiento|balero|baleros|plc|drive|inverter|relay|rele|contactor|connector|conector|switch|interruptor|cylinder|cilindro|robot|robotics|servo|encoder|cnc|fanuc|siemens|festo|smc|balluff|eaton|omron|allen[- ]?bradley|rockwell|schneider|mitsubishi|yaskawa|keyence|ifm|sick|pepperl|turck|phoenix contact|power supply|datasheet|data sheet|specification|part number|order number|model number|refaccion|repuesto|componente industrial|technical|catalogo|catálogo)/i;

export function isNonIndustrialQuery(q) {
  const s = String(q || '').trim();
  if (!s) return false;
  if (INDUSTRIAL_CONTEXT_TERMS.test(s)) return false;
  return NON_INDUSTRIAL_QUERY_TERMS.test(s);
}

// Comparador reproducible: relevancia desc, luego confianza del estado, luego part_number.
export function rankComparator(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const stateRank = { published: 3, validated: 2, incomplete: 1, processed: 0, rejected: -1 };
  const sa = stateRank[a.part.validation_state] ?? 0;
  const sb = stateRank[b.part.validation_state] ?? 0;
  if (sb !== sa) return sb - sa;
  return String(a.part.part_number || '').localeCompare(String(b.part.part_number || ''));
}