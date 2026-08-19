// Tavily Search + clasificación determinística de fuentes industriales.
// Sin respuestas generativas. Sin escrituras en base de datos.
// Tavily es la capa de descubrimiento web; Industrialpedia conserva el filtrado y ranking.

import { extractCompactSpecs, extractPartNumber, extractPlainText, extractTextSpecs, extractValueFirstSpecs, isUsableExternalImageUrl, isUnsafeExtractedPair, stripMarkdownNoise } from './extract.js';
import { deriveProductIdentity } from './productIdentity.js';
import { isTechnicalSpecification } from './semanticResolver.js';
import { selectBestImage } from './imageResolver.js';

const TIMEOUT_MS = 15000;

// Datos básicos determinísticos extraídos del snippet + raw_content que Tavily
// ya devuelve. No requiere una segunda consulta ni invocar ExtraerFichaTecnica:
// da al usuario información técnica mínima inmediatamente al encontrar la refacción.
// Son datos encontrados en la fuente (no verificados): filtro ligero, sin Quality Gateway.
const BASIC_BLOCK = /(?:catalog|folder|page|figure|table|revision|document|literature|scale|warranty|shipping|price|precio|gtin|careers|blog|news|contact|login|register|search|menu|home)/i;
function extractBasicSpecs(snippet, rawContent) {
  const clean = stripMarkdownNoise(`${snippet || ''}\n${rawContent || ''}`);
  const merged = [
    ...extractTextSpecs(clean),
    ...((extractPlainText(clean).specTable) || []),
    ...extractCompactSpecs(clean),
    ...extractValueFirstSpecs(clean)
  ];
  const seen = new Set();
  const out = [];
  for (const s of merged) {
    const attr = String(s.attribute || '').trim().slice(0, 60);
    const val = String(s.value || '').trim().slice(0, 80);
    if (!attr || !val || !/\d/.test(val)) continue;
    if (isUnsafeExtractedPair(attr, val)) continue;
    if (BASIC_BLOCK.test(attr)) continue;
    if (!isTechnicalSpecification(attr, val).ok) continue;
    const key = `${attr}|${val}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ attribute: attr, value: val });
    if (out.length >= 4) break;
  }
  return out;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally { clearTimeout(timer); }
}

const TRUSTED_DISTRIBUTOR_DOMAINS = new Set([
  'mouser.com', 'digikey.com', 'newark.com', 'element14.com', 'farnell.com',
  'rs-online.com', 'rsdelivers.com', 'automationdirect.com', 'grainger.com',
  'misumi.com', 'mcmaster.com', 'tme.eu', 'radwell.com', 'galco.com',
  'alliedelec.com', 'arrow.com', 'avnet.com', 'octopart.com', 'findchips.com',
  'masterelectronics.com', 'futureelectronics.com', 'digikey.ca', 'digikey.mx'
]);

const EXCLUDE_HOST_PATTERNS = /(?:^|[.])(reddit|quora|youtube|youtu\.be|vimeo|facebook|instagram|tiktok|twitter|x\.com|linkedin|ebay|mercadolibre|aliexpress|alibaba|amazon|walmart|temu|wish|etsy|blogspot|wordpress|medium|wikipedia|wikimedia|pinterest|indeed|glassdoor|stackoverflow|stackexchange|repairfaq|fix\.com|ifixit|merriam-webster|wordreference|thesaurus|collinsdictionary|dictionary\.cambridge|cambridgedictionary)(?:[.]|$)/i;
const DICTIONARY_URL_PATTERNS = /(?:\/dictionary\/|\/diccionario\/|\/definition\/|\/definicion\/|\/define\b|\/translate\/|\/traducir\/|\/synonyms\/|\/sinonimos\/)/i;
const EXCLUDE_TEXT_TERMS = [
  'foro', 'forum', 'curso', 'course', 'tutorial', 'opinion', 'opiniones',
  'empleo', 'job', 'jobs', 'careers', 'subasta', 'auction', 'usado', 'used',
  'surplus', 'salvage', 'reparacion', 'repair service', 'classifieds',
  'marketplace', 'segunda mano', 'second hand', 'review', 'reviews'
];

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
function registrableBase(host) {
  const parts = host.split('.').filter(Boolean);
  if (parts.length >= 3 && parts[parts.length - 2].length <= 2) return parts.slice(-3).join('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : host;
}
function domainBaseToken(host) { return registrableBase(host).split('.')[0].replace(/[^a-z0-9]/g, ''); }
function domainMatches(host, domain) { return host === domain || host.endsWith(`.${domain}`); }
function isExcluded(host, title, snippet, url) {
  if (!host || EXCLUDE_HOST_PATTERNS.test(host)) return true;
  if (url && DICTIONARY_URL_PATTERNS.test(url)) return true;
  const text = `${title || ''} ${snippet || ''}`.toLowerCase();
  return EXCLUDE_TEXT_TERMS.some((term) => text.includes(term));
}

// Las páginas corporativas, perfiles sociales y páginas de empresa no son
// fuentes de producto aunque el texto mencione automatización industrial.
// Se filtran a nivel de descubrimiento para que tampoco lleguen a la ficha.
const CORPORATE_ONLY_TERMS = /(?:about us|about the company|company profile|headquarters|locations?|careers?|jobs?|investor relations|investors|financials?|earnings?|annual report|quarterly report|press release|newsroom|contact us|our company|who we are|public company|company size|specialties|industry\s*[:\-]|website\s*[:\-]|employee|employees|linkedin|businesswire|stock price|shareholder|remote workstation|vpn|e-mail valero|energy corporation|refinery company|refining company)/i;

// Señales duras de contenido corporativo que nunca deben convertirse en una
// "fuente de producto", aunque la misma página también mencione "products",
// "automation" u otra palabra técnica. El problema anterior era precisamente
// permitir la página porque contenía una palabra de producto además de la
// información corporativa.
const CORPORATE_HARD_TERMS = /(?:investor relations|investors?|financials?|earnings?|annual report|quarterly report|shareholders?|stock price|press release|newsroom|businesswire|headquarters|company profile|company size|specialties|public company|remote workstation|vpn|careers?|jobs?|employee\s*(?:count|number|size)|energy corporation|refining company|refinery company)/i;

export function isCorporateOnlyResult(item) {
  const host = hostOf(item?.url);
  const text = `${item?.title || ''} ${item?.snippet || item?.content || ''}`;
  if (EXCLUDE_HOST_PATTERNS.test(host)) return true;
  // Estas señales son suficientes por sí mismas: no se relajan porque la página
  // también contenga "product", "automation" o "industrial".
  if (CORPORATE_HARD_TERMS.test(text)) return true;
  return CORPORATE_ONLY_TERMS.test(text) && !PRODUCT_RESULT_TERMS.test(text);
}

// Gate determinístico de relevancia industrial. Tavily es un buscador web general;
// no debemos dejar que una consulta arbitraria (receta, ropa, películas, etc.)
// contamine DiscoveryIndex/SearchQueryLog como si fuera conocimiento industrial.
// Se exige evidencia contextual industrial o una forma clara de PN, y se rechazan
// explícitamente señales de contenido de consumo.
const NON_INDUSTRIAL_TERMS = /(?:recipe|receta|food|comida|restaurant|restaurante|movie|pelicula|music|musica|song|cancion|shoes?|zapatos?|clothing|ropa|fashion|cosmetics?|maquillaje|phone|telefono|smartphone|samsung|galaxy|iphone|apple watch|ipad|tablet pc|laptop|notebook|gaming|video game|hotel|travel|tourism|sports?|deportes?|celebrity|celebridad|stock price|crypto|cryptocurrency|\bintercom\b|\bbeltpack\b|\bbroadcast\b|\bbeltpacks\b|wireless intercom)/i;
const INDUSTRIAL_CONTEXT_TERMS = /(?:industrial|automation|automación|manufacturing|factory|fabrica|electrical|electrico|electronics|electronica|pneumatic|neumatic|hydraulic|hidraulic|sensor|valve|valvula|actuator|motor|bearing|rodamiento|balero|rodamientos|baleros|plc|drive|inverter|relay|rele|contactor|connector|conector|switch|interruptor|cylinder|cilindro|robot|robotics|servo|encoder|cnc|fanuc|siemens|festo|smc|balluff|eaton|omron|allen[- ]?bradley|rockwell|schneider|mitsubishi|yaskawa|keyence|ifm|sick|pepperl\+fuchs|turck|phoenix contact|terminal block|power supply|datasheet|data sheet|technical specification|specification|catalog|part number|order number|model number|replacement|refaccion|refacción|repuesto|componente industrial)/i;

export function isLikelyIndustrialTavilyResult(item, query) {
  const text = `${item?.title || ''} ${item?.content || ''} ${item?.url || ''}`;
  // La consulta y el resultado deben ser compatibles con el dominio industrial.
  // Un texto alfanumérico cualquiera (p. ej. "Balero 2/4", "Modelo 2", "S24")
  // NO es suficiente para convertir cualquier resultado web en una referencia industrial.
  if (NON_INDUSTRIAL_TERMS.test(`${text} ${query || ''}`)) return false;
  // Para consultas por número de parte, el PN es señal industrial suficiente:
  // no exigimos contexto industrial adicional en el texto del resultado.
  if (isPartNumberQuery(String(query || ''))) return true;
  // Para consultas genéricas, el resultado debe demostrar contexto industrial
  // propio. Que la consulta sea industrial no basta: "Bolero" (intercom audio)
  // no es "balero" (rodamiento) aunque la palabra coincida parcialmente.
  return INDUSTRIAL_CONTEXT_TERMS.test(text);
}
function normalizeBrand(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

const GENERIC_TERMS = new Set([
  'industrial', 'product', 'products', 'part', 'parts', 'number', 'catalog', 'catalogue',
  'datasheet', 'sensor', 'sensors', 'valve', 'valves', 'motor', 'motors', 'pneumatic',
  'electrical', 'automation', 'component', 'components', 'refaccion', 'refacciones',
  'repuesto', 'repuestos', 'cilindro', 'cilindros', 'rodamiento', 'rodamientos',
  'bearing', 'bearings', 'plc', 'controlador', 'driver', 'drivers', 'interruptor',
  'rele', 'relay', 'connector', 'conector', 'cable', 'fuente', 'power', 'supply',
  'module', 'modulo', 'the', 'and', 'de', 'para'
]);

export function brandTokensFromQuery(query) {
  const tokens = String(query || '').split(/[^A-Za-z]+/).map((t) => t.trim()).filter(Boolean)
    .filter((t) => t.length >= 3).filter((t) => !/^\d/.test(t))
    .filter((t) => !GENERIC_TERMS.has(t.toLowerCase()));
  return tokens.filter((t, i) => tokens.indexOf(t) === i);
}

export function classifySource(host, brand, queryBrandTokens, title = '', trustedOfficialDomains = []) {
  if (!host) return 'untrusted';
  if ([...TRUSTED_DISTRIBUTOR_DOMAINS].some((d) => domainMatches(host, d))) return 'distributor';
  const base = domainBaseToken(host);
  // Un dominio oficial sólo se reconoce por coincidencia exacta del dominio
  // registrable con la marca normalizada. Un substring no es evidencia:
  // "festosupply.com" no debe convertirse en Festo por contener "festo".
  if (brand && normalizeBrand(brand) === base) return 'official';
  if (queryBrandTokens.some((t) => normalizeBrand(t) === base)) return 'official';

  // Un dominio oficial debe estar demostrado por una lista de dominios oficiales
  // previamente verificada o por coincidencia exacta con la marca. Nunca usamos el
  // título de una página para convertir un distribuidor/tercero en "Fabricante oficial".
  if (trustedOfficialDomains.some((d) => d && domainMatches(host, String(d).toLowerCase().replace(/^www\./, '')))) return 'official';

  return 'web_discovery';
}

function extractBrandFromContent(content, queryBrandTokens) {
  const text = String(content || '').toLowerCase();
  const hit = queryBrandTokens.find((t) => text.includes(t.toLowerCase()));
  return hit || '';
}

function extractImageFromContent(content) {
  const text = String(content || '');
  const markdown = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdown?.[1]) return markdown[1];
  const html = text.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  return html?.[1] || '';
}

async function fetchOgImage(url) {
  try {
    const r = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 Industrialpedia/1.0', 'Accept': 'text/html,application/xhtml+xml' }
    }, 5000);
    if (!r.ok) return '';
    const html = (await r.text()).slice(0, 500000);
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["'](https?:\/\/[^"']+)["']/i)
      || html.match(/<meta[^>]+content=["'](https?:\/\/[^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    return m?.[1] || '';
  } catch { return ''; }
}

// Fetch completo del HTML de una página para resolución de imágenes (JSON-LD,
// og:image, <img>). Usado sólo como fallback cuando el contenido de Tavily
// no aportó una imagen con evidencia suficiente.
async function fetchPageHtml(url) {
  try {
    const r = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 Industrialpedia/1.0', 'Accept': 'text/html,application/xhtml+xml' }
    }, 5000);
    if (!r.ok) return '';
    return (await r.text()).slice(0, 500000);
  } catch { return ''; }
}

function isPartNumberQuery(q) {
  const v = String(q || '').trim();
  if (!v || /\s/.test(v) || /\d+\s*\/\s*\d+/.test(v)) return false;
  if (v.length < 3 || v.length > 40) return false;
  // Un PN no se reconoce por el simple hecho de mezclar letras y números.
  // Debe tener una estructura típica de código industrial: prefijo alfanumérico
  // compacto y, si usa separadores, éstos forman parte del mismo token.
  if (!/^[A-Za-z0-9][A-Za-z0-9\-/_.]*$/.test(v) || !/[A-Za-z]/.test(v) || !/\d/.test(v)) return false;
  return /^[A-Za-z]{1,8}[-_.]?\d[A-Za-z0-9\-/_.]{1,30}$/.test(v)
    || /^\d[A-Za-z0-9\-/_.]{2,39}$/.test(v);
}

function isManufacturerOnlyQuery(q) {
  const tokens = String(q || '').trim().split(/\s+/).filter(Boolean);
  return tokens.length === 1 && brandTokensFromQuery(q).length === 1 && !isPartNumberQuery(q);
}

// Las búsquedas por fabricante deben descubrir productos/componentes, no la
// página corporativa del fabricante. Estas señales suelen corresponder a
// "About us", oficinas, carreras, investor relations, etc. y no a una ficha
// de producto o catálogo utilizable.
const CORPORATE_PAGE_TERMS = /(?:about us|about the company|a global manufacturer|global manufacturer|company profile|corporate|headquarters|locations?|careers?|jobs?|investor relations|investors|financials?|earnings?|annual report|quarterly report|shareholders?|stock price|press release|newsroom|contact us|our company|who we are|public company|company size|specialties|industry\s*[:\-]|website\s*[:\-]|employee|employees|linkedin|businesswire|remote workstation|vpn|energy corporation|refining company|refinery company)/i;
const PRODUCT_RESULT_TERMS = /(?:product|products|catalog|catalogue|datasheet|data sheet|part number|order number|model|series|pneumatic|electromechanical|electrical|automation|actuator|cylinder|valve|sensor|gripper|drive|motor|controller|plc|connector|fitting|regulator|filter|vacuum|component|refaccion|repuesto|componente)/i;

export function isProductResultForManufacturer(item) {
  const text = `${item?.title || ''} ${item?.snippet || item?.content || ''} ${item?.url || ''}`;
  // Para una consulta por fabricante, una página corporativa nunca cuenta como
  // producto aunque también diga "products", "automation" o "industrial".
  if (CORPORATE_PAGE_TERMS.test(text) || CORPORATE_HARD_TERMS.test(text)) return false;
  // No basta con que el dominio sea el del fabricante: la página debe demostrar
  // que representa un producto, catálogo, datasheet, modelo/serie o componente.
  return PRODUCT_RESULT_TERMS.test(text) || /[A-Za-z]{1,6}[-_]?\d[A-Za-z0-9_-]{2,}/.test(text);
}

// Clasificación de tipo de contenido para ranking de calidad de fuentes web.
// Determinística: basada en señales estructurales del título, descripción, URL
// y datos ya extraídos (PN, specs). Un resultado industrial debe priorizar
// producto/modelo > familia/catálogo > distribuidor > artículo > otro.
// Los artículos/editoriales no se eliminan (pueden tener información técnica
// útil) pero nunca superan a una fuente de producto/catálogo relevante.
const PRODUCT_MODEL_LABELS = /(?:part number|order number|model number|model no\b|art[\.\s]*nr|article number|product number|\bmpn\b|\bsku\b|order code|bestellnummer|part no\b|model code)/i;
const PRODUCT_FAMILY_SIGNALS = /(?:\bseries\b|\bfamily\b|\bfamilia\b|\bserie\b|\brange\b|product line|product family|product overview|product listing|product selector|catalog overview)/i;
const DATASHEET_SIGNALS = /(?:datasheet|data sheet|hoja de datos|specifications?|technical data|technical specifications|ficha t[ée]cnica|spec sheet|product specifications)/i;
const DISTRIBUTOR_BUY_SIGNALS = /(?:\bbuy\b|\bpurchase\b|comprar|precio|\bprice\b|in stock|disponible|add to cart|order now|distribuidor|distributor|authorized distributor|authorised distributor)/i;
const ARTICLE_EDITORIAL_SIGNALS = /(?:\bblog\b|\barticle\b|art[íi]culo|noticias?|\bnews\b|\bpost\b|gu[íi]a|\btutorial\b|how to|c[óo]mo funcionan|qu[ée] es|what is|learn about|understanding|introduction to|overview of|benefits of|applications of|types of|que es un|que son los)/i;
const ARTICLE_URL_PATTERNS = /(?:\/blog\/|\/article|\/post\/|\/news\/|\/learning[-_/]|\/columns?\/|\/guide\/|\/tutorial\/|\/how-to\/|\/what-is\/|\/education\/|\/resources\/|\/wiki\/|\/support\/.*\/educational)/i;
const PN_IN_TEXT = /\b[A-Z]{2,6}[-_]?\d{2,}[A-Z0-9-_/]*\b/;

export function classifyContentType(item) {
  const title = String(item?.title || '');
  const snippet = String(item?.snippet || item?.content || item?.description || '');
  const url = String(item?.url || '');
  const text = `${title} ${snippet}`;
  const sourceType = String(item?.source_type || '');
  const isPdf = /\.pdf(?:$|[?#])/i.test(url) || Boolean(item?.is_pdf);

  // PDF datasheets: máxima prioridad (documentación técnica verificable).
  if (isPdf) return { type: 'datasheet', tier: 5 };

  // Señales tempranas necesarias para distinguir artículos de productos.
  const hasDatasheetEarly = DATASHEET_SIGNALS.test(text);
  const isArticleUrl = ARTICLE_URL_PATTERNS.test(url);
  const isArticleTitle = ARTICLE_EDITORIAL_SIGNALS.test(title);

  // Artículos/editoriales con señales claras en URL + título: se conservan si
  // tienen información técnica útil, pero se clasifican por debajo de
  // productos/catálogos. Incluso si el contenido menciona PNs o términos de
  // producto, la estructura de la página (URL + título) demuestra que es
  // contenido editorial, no una ficha de producto.
  if (!isPdf && !hasDatasheetEarly && isArticleUrl && isArticleTitle) {
    return { type: 'article_editorial', tier: 1 };
  }

  const isCorporate = CORPORATE_HARD_TERMS.test(text) ||
    (CORPORATE_PAGE_TERMS.test(text) && !PRODUCT_RESULT_TERMS.test(text));
  const hasExtractedPn = Boolean(item?.part_number && String(item.part_number).trim().length >= 3);
  const hasProductModel = hasExtractedPn || PRODUCT_MODEL_LABELS.test(text) || PN_IN_TEXT.test(text);
  const hasSpecs = Array.isArray(item?.basic_specs) && item.basic_specs.length > 0;
  const hasFamily = PRODUCT_FAMILY_SIGNALS.test(text);
  const hasDatasheet = DATASHEET_SIGNALS.test(text);
  const hasDistributorBuy = DISTRIBUTOR_BUY_SIGNALS.test(text);
  const isDistributorSource = sourceType === 'distributor';
  const isOfficialSource = sourceType === 'official';

  // Páginas corporativas: prioridad mínima (se filtran aparte, pero quedan como
  // red de seguridad si alguna pasa los filtros).
  if (isCorporate && !hasProductModel && !hasDatasheet) return { type: 'corporate', tier: 0 };

  // Producto identificable: PN/modelo + contexto de producto (oficial,
  // distribuidor, datasheet, compra o specs extraídas).
  if (hasProductModel && (isOfficialSource || isDistributorSource || hasDatasheet || hasDistributorBuy || hasSpecs)) {
    return { type: 'product_page', tier: 5 };
  }

  // Catálogo técnico / página de especificaciones.
  if (hasDatasheet && (isOfficialSource || isDistributorSource || hasProductModel || hasSpecs)) {
    return { type: 'technical_catalog', tier: 5 };
  }

  // Listado de distribuidor con señales de producto.
  if (isDistributorSource && (hasDistributorBuy || hasProductModel || hasFamily || hasSpecs)) {
    return { type: 'distributor_listing', tier: 4 };
  }

  // Familia de producto de fuente oficial/distribuidor.
  if (hasFamily && (isOfficialSource || isDistributorSource)) {
    return { type: 'product_family', tier: 4 };
  }

  // Producto identificable sin contexto fuerte de fuente (aún útil, pero por
  // debajo de productos con respaldo oficial/distribuidor).
  if (hasProductModel || hasSpecs) {
    return { type: 'product_page', tier: 3 };
  }

  // Artículo/editorial: se conserva si tiene información técnica útil, pero
  // nunca supera a una fuente de producto/catálogo relevante.
  if (ARTICLE_EDITORIAL_SIGNALS.test(text) || ARTICLE_EDITORIAL_SIGNALS.test(url)) {
    return { type: 'article_editorial', tier: 1 };
  }

  return { type: 'other_industrial', tier: 2 };
}

// Relevancia lexical de la consulta. El buscador externo puede devolver páginas
// industrialmente válidas pero poco relacionadas con lo que el usuario escribió.
// Para BUSCAR, la relevancia de la consulta debe dominar al simple hecho de que
// una página sea PDF o contenga vocabulario industrial.
function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function queryTokensForRanking(query) {
  return normalizeSearchText(query).split(/\s+/).filter((t) => t.length >= 2);
}

function tokenMatchesField(token, field) {
  const text = normalizeSearchText(field);
  if (!text) return false;
  if (text.split(/\s+/).some((word) => word === token)) return true;
  // Permite búsquedas cortas como "Rex" -> "Rexroth", pero exige prefijo de palabra,
  // nunca una coincidencia arbitraria dentro de otra palabra.
  return text.split(/\s+/).some((word) => word.startsWith(token) && token.length >= 3);
}

export function queryRelevanceScore(item, query) {
  const tokens = queryTokensForRanking(query);
  if (!tokens.length) return 0;
  const title = item?.title || '';
  const url = item?.url || '';
  const snippet = item?.snippet || item?.content || item?.description || '';
  const identity = item?.product_name || item?.product_identity?.short_description || '';
  let score = 0;
  let matched = 0;
  for (const token of tokens) {
    if (tokenMatchesField(token, title)) { score += 80; matched++; continue; }
    if (tokenMatchesField(token, identity)) { score += 65; matched++; continue; }
    if (tokenMatchesField(token, snippet)) { score += 45; matched++; continue; }
    if (tokenMatchesField(token, url)) { score += 35; matched++; continue; }
  }
  // Las consultas de varias palabras deben demostrar todas sus palabras relevantes.
  // Para una consulta corta de una sola palabra basta una coincidencia fuerte.
  if (tokens.length > 1 && matched < tokens.length) return 0;
  return score;
}

export function isQueryRelevantIndustrialResult(item, query) {
  const q = String(query || '').trim();
  if (!q) return true;
  if (isPartNumberQuery(q)) return true;
  return queryRelevanceScore(item, q) > 0;
}

// Reordena resultados web por: 1) relevancia con la consulta, 2) tipo de contenido,
// 3) autoridad de la fuente y 4) score del proveedor. Un PDF irrelevante ya no puede
// quedar arriba solo por ser PDF. Determinístico y generalizable.
export function rankIndustrialResults(results, query = '') {
  const sourcePriority = { official: 4, distributor: 3, web_discovery: 1, untrusted: 0 };
  const withScores = results.map((r) => ({
    r,
    queryScore: queryRelevanceScore(r, query),
    tier: classifyContentType(r).tier
  }));
  withScores.sort((a, b) => {
    if (b.queryScore !== a.queryScore) return b.queryScore - a.queryScore;
    if (b.tier !== a.tier) return b.tier - a.tier;
    const spDiff = (sourcePriority[b.r.source_type] || 0) - (sourcePriority[a.r.source_type] || 0);
    if (spDiff) return spDiff;
    return (b.r.relevance_score || 0) - (a.r.relevance_score || 0);
  });
  return withScores.map((x) => x.r);
}

// Extracción determinística de Part Number desde una consulta multi-token o
// desde el título del resultado. No inventa PNs: sólo extrae tokens que
// coinciden con el patrón estructural de un número de parte industrial.
function extractPnFromQuery(q) {
  const tokens = String(q || '').split(/\s+/);
  for (const t of tokens) {
    if (/^[A-Z]{1,4}-?\d[A-Z0-9-]{1,12}$/.test(t)) return t;
  }
  return '';
}

function resolvePartNumber(query, title) {
  const queryPn = extractPnFromQuery(query);
  if (queryPn) return queryPn;
  return extractPartNumber('', title);
}

export async function tavilySearch(query, apiKey, options = {}) {
  if (!apiKey) return { results: [], error: 'tavily_not_configured', detail: 'Falta Apy_Tavly' };
  try {
    const payload = {
      query: String(query || '').trim(),
      search_depth: 'basic',
      topic: 'general',
      max_results: options.max_results || 10,
      include_answer: false,
      include_raw_content: true,
      include_images: true,
      ...(options.include_domains?.length ? { include_domains: options.include_domains } : {})
    };
    const r = await fetchWithTimeout('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    const body = await r.text().catch(() => '');
    if (!r.ok) return { results: [], error: `tavily_http_${r.status}`, detail: body.slice(0, 500) };
    const data = JSON.parse(body);
    return {
      results: Array.isArray(data.results) ? data.results : [],
      images: Array.isArray(data.images) ? data.images : [],
      error: null,
      detail: null
    };
  } catch (e) {
    if (e?.name === 'AbortError') return { results: [], error: 'tavily_timeout', detail: 'La consulta excedió el tiempo límite' };
    return { results: [], error: `tavily_exception_${e?.name || 'unknown'}`, detail: String(e?.message || '').slice(0, 500) };
  }
}

export async function discoverTavilyIndustrial(query, apiKey, options = {}) {
  const q = String(query || '').trim();
  if (!q) return { provider: 'none', results: [], telemetry: { configured: Boolean(apiKey), queries_made: 0, error: null, detail: null } };

  const queryBrandTokens = brandTokensFromQuery(q);
  const partLike = isPartNumberQuery(q);
  const manufacturerOnly = options.manufacturerOnly === true || isManufacturerOnlyQuery(q);
  // Para una marca sola, pedir explícitamente productos/componentes evita que
  // Tavily priorice la portada corporativa. Seguimos haciendo una sola consulta.
  const searchQuery = manufacturerOnly ? `${q} products industrial components catalog` : q;
  const batch = await tavilySearch(searchQuery, apiKey, { max_results: 10 });
  let queriesMade = 1;
  let primaryError = batch.error;
  let primaryDetail = batch.detail;
  let items = batch.results;
  let batchImages = batch.images || [];

  if (!items.length && !primaryError) {
    const fallbackQuery = partLike ? `${q} datasheet` : `${q} datasheet specifications`;
    const fb = await tavilySearch(fallbackQuery, apiKey, { max_results: 10 });
    queriesMade++;
    if (fb.error && !primaryError) { primaryError = fb.error; primaryDetail = fb.detail; }
    items = fb.results;
    batchImages = fb.images || [];
  }

  // Cada resultado obtiene únicamente una imagen demostrada por ESA fuente:
  // imagen vinculada al resultado > imagen embebida en SU contenido > og:image
  // de SU propia URL. Nunca reutilizamos una imagen de otro resultado, porque
  // una imagen cruzada puede atribuir visualmente el producto equivocado.
  const enriched = await Promise.all(items.map(async (item) => {
    const host = hostOf(item.url);
    const title = item.title || '';
    const snippet = item.content || '';
    const brand = extractBrandFromContent(`${title} ${snippet}`, queryBrandTokens);
    const sourceType = classifySource(host, brand, queryBrandTokens, title, options.trustedOfficialDomains || []);
    const partNumber = partLike ? q : resolvePartNumber(q, title);
    const tavilyImages = Array.isArray(item.images)
      ? item.images.map((x) => typeof x === 'string' ? x : x?.url).filter(Boolean)
      : [];
    const identity = deriveProductIdentity({
      title,
      text: item.raw_content || snippet,
      query: q,
      // manufacturer_hint: solo brand (token de consulta encontrado en contenido).
      // identifyManufacturer valida el hint contra fabricantes conocidos, así que
      // un token genérico como "balero" se rechaza. No se pasa queryBrandTokens[0]
      // directamente: ese fallback derivaba manufacturer desde la consulta sin evidencia.
      manufacturer_hint: brand || '',
      part_number_hint: partNumber,
      source_url: item.url
    });
    const imgCtx = {
      manufacturer: identity.manufacturer,
      partNumber: identity.part_number || partNumber,
      query: q,
      source_url: item.url
    };
    let resolved = selectBestImage({
      markdown: item.raw_content || item.content || '',
      tavily_image_url: item.image_url,
      tavily_images: tavilyImages,
      product_context: imgCtx
    });
    let imageUrl = resolved?.image_url || '';
    if (!imageUrl) {
      const html = await fetchPageHtml(item.url);
      if (html) {
        resolved = selectBestImage({
          html,
          tavily_image_url: item.image_url,
          tavily_images: tavilyImages,
          product_context: imgCtx
        }) || resolved;
        if (resolved?.image_url) imageUrl = resolved.image_url;
      }
    }
    return {
      title,
      url: item.url,
      display_link: host,
      snippet,
      source_type: sourceType,
      image_url: imageUrl,
      image_method: resolved?.method || '',
      image_confidence: resolved?.confidence || 0,
      image_source_url: resolved?.source_url || item.url,
      basic_specs: extractBasicSpecs(snippet, item.raw_content),
      // manufacturer_name: solo desde identidad derivada con evidencia (identity.manufacturer).
      // Nunca desde tokens de la consulta (brand, queryBrandTokens): un token de la
      // consulta que aparece en el contenido NO es evidencia de fabricante.
      manufacturer_name: identity.manufacturer || '',
      part_number: identity.part_number || partNumber,
      product_name: identity.short_description,
      product_identity: identity,
      description: snippet,
      raw_content: item.raw_content || '',
      is_pdf: /\.pdf(?:$|[?#])/i.test(item.url || ''),
      provider: 'tavily',
      relevance_score: typeof item.score === 'number' ? item.score : null
    };
  }));

  const filtered = enriched.filter((r) =>
    !isExcluded(hostOf(r.url), r.title, r.snippet, r.url) &&
    !isCorporateOnlyResult(r) &&
    isLikelyIndustrialTavilyResult(r, q) &&
    isQueryRelevantIndustrialResult(r, q) &&
    (!manufacturerOnly || isProductResultForManufacturer(r))
  );
  return {
    provider: 'tavily',
    results: rankIndustrialResults(filtered, q).slice(0, 20),
    telemetry: {
      configured: Boolean(apiKey),
      queries_made: queriesMade,
      error: primaryError,
      detail: primaryDetail
    }
  };
}