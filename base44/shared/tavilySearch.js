// Tavily Search + clasificación determinística de fuentes industriales.
// Sin respuestas generativas. Sin escrituras en base de datos.
// Tavily es la capa de descubrimiento web; Industrialpedia conserva el filtrado y ranking.

import { extractCompactSpecs, extractPartNumber, extractPlainText, extractTextSpecs, extractValueFirstSpecs, isUsableExternalImageUrl, stripMarkdownNoise } from './extract.js';
import { deriveProductIdentity } from './productIdentity.js';

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
    if (BASIC_BLOCK.test(attr)) continue;
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

const EXCLUDE_HOST_PATTERNS = /(?:^|[.])(reddit|quora|youtube|youtu\.be|vimeo|facebook|instagram|tiktok|twitter|x\.com|ebay|mercadolibre|aliexpress|alibaba|blogspot|wordpress|medium|wikipedia|wikimedia|pinterest|indeed|linkedin\.com\/(jobs|pulse)|glassdoor|stackoverflow|stackexchange|repairfaq|fix\.com|ifixit)(?:[.]|$)/i;
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
function isExcluded(host, title, snippet) {
  if (!host || EXCLUDE_HOST_PATTERNS.test(host)) return true;
  const text = `${title || ''} ${snippet || ''}`.toLowerCase();
  return EXCLUDE_TEXT_TERMS.some((term) => text.includes(term));
}

// Gate determinístico de relevancia industrial. Tavily es un buscador web general;
// no debemos dejar que una consulta arbitraria (receta, ropa, películas, etc.)
// contamine DiscoveryIndex/SearchQueryLog como si fuera conocimiento industrial.
// Se exige evidencia contextual industrial o una forma clara de PN, y se rechazan
// explícitamente señales de contenido de consumo.
const NON_INDUSTRIAL_TERMS = /(?:recipe|receta|food|comida|restaurant|restaurante|movie|pelicula|music|musica|song|cancion|shoes?|zapatos?|clothing|ropa|fashion|cosmetics?|maquillaje|phone|telefono|smartphone|samsung|galaxy|iphone|apple watch|ipad|tablet pc|laptop|notebook|gaming|video game|hotel|travel|tourism|sports?|deportes?|celebrity|celebridad|stock price|crypto|cryptocurrency)/i;
const INDUSTRIAL_CONTEXT_TERMS = /(?:industrial|automation|automación|manufacturing|factory|fabrica|electrical|electrico|electronics|electronica|pneumatic|neumatic|hydraulic|hidraulic|sensor|valve|valvula|actuator|motor|bearing|rodamiento|plc|drive|inverter|relay|rele|contactor|connector|conector|switch|interruptor|cylinder|cilindro|robot|robotics|servo|encoder|cnc|fanuc|siemens|festo|smc|balluff|eaton|omron|allen[- ]?bradley|rockwell|schneider|mitsubishi|yaskawa|keyence|ifm|sick|pepperl\+fuchs|turck|phoenix contact|terminal block|power supply|datasheet|data sheet|technical specification|specification|catalog|part number|order number|model number|replacement|refaccion|refacción|repuesto|componente industrial)/i;

export function isLikelyIndustrialTavilyResult(item, query) {
  const text = `${item?.title || ''} ${item?.content || ''} ${item?.url || ''}`;
  // El chequeo de no-industrial incluye la consulta: "Samsung S24", "iPhone 15",
  // etc. no deben pasar aunque el token tenga letras+dígitos como un PN industrial.
  if (NON_INDUSTRIAL_TERMS.test(`${text} ${query || ''}`)) return false;
  const q = String(query || '').trim();
  const partLike = /[A-Za-z]/.test(q) && /\d/.test(q) && q.length >= 3 && q.length <= 40;
  if (partLike) return true;
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

function classifySource(host, brand, queryBrandTokens, title = '') {
  if (!host) return 'untrusted';
  if ([...TRUSTED_DISTRIBUTOR_DOMAINS].some((d) => domainMatches(host, d))) return 'distributor';
  const base = domainBaseToken(host);
  if (brand && (normalizeBrand(brand) === base || base.includes(normalizeBrand(brand)))) return 'official';
  if (queryBrandTokens.some((t) => normalizeBrand(t) === base || base.includes(normalizeBrand(t)))) return 'official';

  // Para búsquedas por número de parte no hay marca en la consulta. Si el título
  // demuestra la misma marca que el dominio, tratamos la fuente como oficial.
  // Esto evita priorizar micrositios/foros cuando Tavily encuentra el catálogo del fabricante.
  const titleTokens = String(title || '').split(/[^A-Za-z0-9]+/).filter((t) => t.length >= 3);
  if (titleTokens.some((t) => {
    const n = normalizeBrand(t);
    return n && (n === base || base.includes(n) || n.includes(base));
  })) return 'official';

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

function isPartNumberQuery(q) {
  const v = String(q || '').trim();
  if (!v) return false;
  const tokens = v.split(/\s+/);
  if (tokens.length === 1) return /[A-Za-z]/.test(v) && /\d/.test(v) && v.length >= 3 && v.length <= 40;
  return tokens.length <= 3 && tokens.some((t) => /[A-Za-z]/.test(t) && /\d/.test(t));
}

function isManufacturerOnlyQuery(q) {
  const tokens = String(q || '').trim().split(/\s+/).filter(Boolean);
  return tokens.length === 1 && brandTokensFromQuery(q).length === 1 && !isPartNumberQuery(q);
}

// Las búsquedas por fabricante deben descubrir productos/componentes, no la
// página corporativa del fabricante. Estas señales suelen corresponder a
// "About us", oficinas, carreras, investor relations, etc. y no a una ficha
// de producto o catálogo utilizable.
const CORPORATE_PAGE_TERMS = /(?:about us|about the company|a global manufacturer|global manufacturer|company profile|corporate|headquarters|locations?|careers?|jobs?|investor relations|investors|press release|newsroom|contact us|our company|who we are|sobre nosotros|la empresa|oficinas|ubicaciones|empleo|trabaja con nosotros)/i;
const PRODUCT_RESULT_TERMS = /(?:product|products|catalog|catalogue|datasheet|data sheet|part number|order number|model|series|pneumatic|electromechanical|electrical|automation|actuator|cylinder|valve|sensor|gripper|drive|motor|controller|plc|connector|fitting|regulator|filter|vacuum|component|refaccion|repuesto|componente)/i;

export function isProductResultForManufacturer(item) {
  const text = `${item?.title || ''} ${item?.snippet || item?.content || ''} ${item?.url || ''}`;
  if (CORPORATE_PAGE_TERMS.test(text)) return false;
  return PRODUCT_RESULT_TERMS.test(text) || /[A-Za-z]{1,6}[-_]?\d[A-Za-z0-9_-]{2,}/.test(text);
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
    const sourceType = classifySource(host, brand, queryBrandTokens, title);
    const partNumber = partLike ? q : resolvePartNumber(q, title);
    const contentImage = extractImageFromContent(item.raw_content || item.content || '');
    const resultImages = Array.isArray(item.images)
      ? item.images.map((x) => typeof x === 'string' ? x : x?.url).filter(Boolean)
      : [];
    const sourceImage = resultImages[0] || '';
    let imageUrl = [item.image_url, sourceImage, contentImage].find(isUsableExternalImageUrl) || '';
    if (!imageUrl) {
      const ogImage = await fetchOgImage(item.url);
      if (isUsableExternalImageUrl(ogImage)) imageUrl = ogImage;
    }
    const identity = deriveProductIdentity({
      title,
      text: item.raw_content || snippet,
      query: q,
      manufacturer_hint: brand || (queryBrandTokens.length === 1 ? queryBrandTokens[0] : ''),
      part_number_hint: partNumber,
      source_url: item.url
    });
    return {
      title,
      url: item.url,
      display_link: host,
      snippet,
      source_type: sourceType,
      image_url: imageUrl,
      basic_specs: extractBasicSpecs(snippet, item.raw_content),
      manufacturer_name: identity.manufacturer || brand || (queryBrandTokens.length === 1 ? queryBrandTokens[0] : ''),
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
    !isExcluded(hostOf(r.url), r.title, r.snippet) &&
    isLikelyIndustrialTavilyResult(r, q) &&
    (!manufacturerOnly || isProductResultForManufacturer(r))
  );
  const sourcePriority = { official: 3, distributor: 2, web_discovery: 1, untrusted: 0 };
  filtered.sort((a, b) => {
    const priorityDiff = (sourcePriority[b.source_type] || 0) - (sourcePriority[a.source_type] || 0);
    if (priorityDiff) return priorityDiff;
    return (b.relevance_score || 0) - (a.relevance_score || 0);
  });
  return {
    provider: 'tavily',
    results: filtered.slice(0, 20),
    telemetry: {
      configured: Boolean(apiKey),
      queries_made: queriesMade,
      error: primaryError,
      detail: primaryDetail
    }
  };
}