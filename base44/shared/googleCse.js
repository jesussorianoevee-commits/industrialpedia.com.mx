// Google Custom Search JSON API + clasificación determinística de fuentes industriales.
// Sin IA. Sin lógica específica por marca. Sin escrituras en base de datos.
// Google es la capa de descubrimiento: encuentra la fuente real; la ficha se
// construye después desde esa fuente, sin inventar datos.

const TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally { clearTimeout(timer); }
}

// Una sola consulta al CSE. Devuelve items crudos + telemetría segura (sin API key).
export async function googleCseSearch(query, apiKey, cx, num = 10) {
  if (!apiKey || !cx) return { items: [], error: 'google_not_configured', detail: 'Falta API key o CSE ID' };
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${num}&filter=1&safe=active&hl=en`;
    const r = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { items: [], error: `google_http_${r.status}`, detail: body.slice(0, 300) };
    }
    const data = await r.json();
    if (data.error) return { items: [], error: `google_api_${data.error.code || 'error'}`, detail: String(data.error.message || '').slice(0, 300) };
    return { items: data.items || [], error: null, detail: null };
  } catch (e) {
    const name = e?.name || 'unknown';
    if (name === 'AbortError') return { items: [], error: 'google_timeout', detail: 'La consulta excedió el tiempo límite' };
    return { items: [], error: `google_exception_${name}`, detail: String(e?.message || '').slice(0, 300) };
  }
}

// Distribuidores industriales reconocidos (canales, no marcas de producto).
const TRUSTED_DISTRIBUTOR_DOMAINS = new Set([
  'mouser.com', 'digikey.com', 'newark.com', 'element14.com', 'farnell.com',
  'rs-online.com', 'rsdelivers.com', 'automationdirect.com', 'grainger.com',
  'misumi.com', 'mcmaster.com', 'tme.eu', 'radwell.com', 'galco.com',
  'alliedelec.com', 'arrow.com', 'avnet.com', 'octopart.com', 'findchips.com',
  'masterelectronics.com', 'futureelectronics.com', 'digikey.ca', 'digikey.mx'
]);

// Exclusiones: contenido no técnico que no debe presentarse como fuente de ficha.
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
  // Maneja dominios tipo .co.uk tomando los últimos 3 segmentos cuando el penúltimo es corto.
  if (parts.length >= 3 && parts[parts.length - 2].length <= 2) return parts.slice(-3).join('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : host;
}

function domainBaseToken(host) {
  return registrableBase(host).split('.')[0].replace(/[^a-z0-9]/g, '');
}

function domainMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isExcluded(host, title, snippet) {
  if (!host) return true;
  if (EXCLUDE_HOST_PATTERNS.test(host)) return true;
  const text = `${title || ''} ${snippet || ''}`.toLowerCase();
  return EXCLUDE_TEXT_TERMS.some((term) => text.includes(term));
}

function normalizeBrand(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function looksLikePartNumber(s) {
  const v = String(s || '').trim();
  return /[A-Za-z]/.test(v) && /\d/.test(v) && v.length >= 3 && v.length <= 40;
}

// Tokens de marca derivados EXCLUSIVAMENTE de la consulta del usuario (no del dominio).
// Un token de marca debe ser alfabético y no un término técnico genérico.
const GENERIC_TERMS = new Set([
  'industrial', 'product', 'products', 'part', 'parts', 'number', 'catalog',
  'catalogue', 'datasheet', 'sensor', 'sensors', 'valve', 'valves', 'motor',
  'motors', 'pneumatic', 'electrical', 'automation', 'component', 'components',
  'refaccion', 'refacciones', 'repuesto', 'repuestos', 'cilindro', 'cilindros',
  'rodamiento', 'rodamientos', 'bearing', 'bearings', 'plc', 'controlador',
  'driver', 'drivers', 'interruptor', 'rele', 'relay', 'connector', 'conector',
  'cable', 'fuente', 'power', 'supply', 'module', 'modulo', 'module', 'the', 'and', 'de', 'para'
]);

export function brandTokensFromQuery(query) {
  const tokens = String(query || '')
    .split(/[^A-Za-z]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 3)
    .filter((t) => !/^\d/.test(t))
    .filter((t) => !GENERIC_TERMS.has(t.toLowerCase()));
  return tokens.filter((t, i) => tokens.indexOf(t) === i);
}

function firstMeta(metatags, keys) {
  if (!Array.isArray(metatags)) return '';
  for (const m of metatags) {
    for (const k of keys) {
      const v = m[k] || m[k.toLowerCase()];
      if (v) return String(v).trim();
    }
  }
  return '';
}

function extractImage(pagemap, metatags) {
  if (Array.isArray(pagemap?.cse_thumbnail) && pagemap.cse_thumbnail[0]?.src) return pagemap.cse_thumbnail[0].src;
  if (Array.isArray(pagemap?.cse_image) && pagemap.cse_image[0]?.src) return pagemap.cse_image[0].src;
  const img = firstMeta(metatags, ['og:image', 'twitter:image']);
  return img || '';
}

function extractBrand(pagemap, metatags) {
  const products = Array.isArray(pagemap?.product) ? pagemap.product : (Array.isArray(pagemap?.Product) ? pagemap.Product : []);
  for (const p of products) {
    const b = p?.brand;
    if (typeof b === 'string' && b.trim()) return b.trim();
    if (b && typeof b === 'object' && b.name) return String(b.name).trim();
    if (p?.manufacturer && typeof p.manufacturer === 'string') return p.manufacturer.trim();
    if (p?.manufacturer && typeof p.manufacturer === 'object' && p.manufacturer?.name) return String(p.manufacturer.name).trim();
  }
  return firstMeta(metatags, ['product:brand', 'product:manufacturer', 'og:site_name', 'application-name', 'author', 'article:author']) || '';
}

function extractProductName(pagemap, metatags, title) {
  const products = Array.isArray(pagemap?.product) ? pagemap.product : (Array.isArray(pagemap?.Product) ? pagemap.Product : []);
  for (const p of products) {
    if (p?.name) return String(p.name).trim();
  }
  return firstMeta(metatags, ['og:title', 'twitter:title']) || title || '';
}

function extractPartNumberFromText(text, hint) {
  const re = /\b[A-Z0-9][A-Z0-9._\/-]{2,39}\b/g;
  const matches = String(text || '').toUpperCase().match(re) || [];
  const filtered = matches.filter((t) => /\d/.test(t) && /[A-Za-z]/.test(t));
  if (hint) {
    const norm = normalizeBrand(hint);
    const hit = filtered.find((t) => normalizeBrand(t) === norm);
    if (hit) return hit;
  }
  return filtered[0] || '';
}

function extractMpnSku(pagemap) {
  const products = Array.isArray(pagemap?.product) ? pagemap.product : (Array.isArray(pagemap?.Product) ? pagemap.Product : []);
  for (const p of products) {
    if (p?.mpn) return String(p.mpn).trim();
    if (p?.sku) return String(p.sku).trim();
    if (p?.gtin) return String(p.gtin).trim();
  }
  const offers = Array.isArray(pagemap?.offer) ? pagemap.offer : (Array.isArray(pagemap?.Offer) ? pagemap.Offer : []);
  for (const o of offers) {
    if (o?.sku) return String(o.sku).trim();
  }
  return '';
}

// Clasifica la fuente con evidencia, no por parecido de dominio.
// official: el dominio coincide con la marca demostrada por la fuente (schema.org
//   Product.brand) o con un token de marca explícito en la consulta del usuario.
// distributor: dominio en la lista de distribuidores reconocidos.
// cse_configured: resultado del CSE que no podemos confirmar como oficial.
function classifySource(host, brand, queryBrandTokens) {
  if (!host) return 'untrusted';
  if ([...TRUSTED_DISTRIBUTOR_DOMAINS].some((d) => domainMatches(host, d))) return 'distributor';
  const base = domainBaseToken(host);
  if (!base) return 'cse_configured';
  if (brand) {
    const bn = normalizeBrand(brand);
    if (bn && bn.length >= 3 && bn === base) return 'official';
  }
  if (queryBrandTokens.length) {
    const matched = queryBrandTokens.find((t) => normalizeBrand(t) === base);
    if (matched) return 'official';
  }
  return 'cse_configured';
}

function isPdfUrl(url, pagemap) {
  if (/\.pdf(?:$|[?#])/i.test(url)) return true;
  const fileFormats = Array.isArray(pagemap?.fileformat) ? pagemap.fileformat : [];
  return fileFormats.some((f) => /pdf/i.test(String(f?.fileFormat || f || '')));
}

function isPartNumberQuery(q) {
  const v = String(q || '').trim();
  if (!v) return false;
  // Un número de parte típico: contiene letras y dígitos, pocos espacios, con guiones/puntos.
  const tokens = v.split(/\s+/);
  if (tokens.length === 1) return looksLikePartNumber(v);
  // Si la consulta es corta y todos sus tokens parecen identificadores.
  return tokens.length <= 3 && tokens.every((t) => looksLikePartNumber(t) || t.length <= 4);
}

// Orquesta el descubrimiento: 1 consulta exacta, fallback técnico solo si es necesario.
// No hace múltiples consultas innecesarias para no consumir cuota.
export async function discoverGoogleIndustrial(query, apiKey, cx) {
  const q = String(query || '').trim();
  if (!q) return { provider: 'none', results: [], telemetry: { google_configured: Boolean(apiKey && cx), queries_made: 0, google_error: null, google_detail: null } };

  const queryBrandTokens = brandTokensFromQuery(q);
  const partLike = isPartNumberQuery(q);

  // 1) Consulta principal. Para PNs usamos la referencia literal; el CSE ya tiene
  //    los dominios industriales configurados, por lo que la consulta simple es la
  //    más eficaz y económica.
  const mainQuery = partLike ? q : q;
  let batch = await googleCseSearch(mainQuery, apiKey, cx, 10);
  let queriesMade = 1;
  let primaryError = batch.error;
  let primaryDetail = batch.detail;
  let items = batch.items;

  // 2) Fallback técnico ÚNICO si la principal no devolvió resultados.
  if (!items.length && !primaryError) {
    const fallbackQuery = partLike ? `${q} datasheet` : `${q} datasheet specifications`;
    const fb = await googleCseSearch(fallbackQuery, apiKey, cx, 10);
    queriesMade++;
    if (fb.error && !primaryError) { primaryError = fb.error; primaryDetail = fb.detail; }
    items = fb.items;
  }

  const enriched = items.map((item) => {
    const host = hostOf(item.link);
    const pagemap = item.pagemap || {};
    const metatags = Array.isArray(pagemap.metatags) ? pagemap.metatags : [];
    const brand = extractBrand(pagemap, metatags);
    const product = extractProductName(pagemap, metatags, item.title);
    const image = extractImage(pagemap, metatags);
    const mpn = extractMpnSku(pagemap);
    const title = item.title || product || '';
    const snippet = item.snippet || '';
    const partFromText = extractPartNumberFromText(`${title} ${snippet}`, partLike ? q : '');
    const partNumber = mpn || partFromText || (partLike ? q : '');
    const sourceType = classifySource(host, brand, queryBrandTokens);
    const manufacturer = brand || (queryBrandTokens.length === 1 ? queryBrandTokens[0] : '');
    return {
      title,
      url: item.link,
      display_link: item.displayLink || host,
      snippet,
      source_type: sourceType,
      image_url: image,
      manufacturer_name: manufacturer,
      part_number: partNumber,
      product_name: product,
      description: snippet,
      is_pdf: isPdfUrl(item.link, pagemap),
      provider: 'google'
    };
  });

  // Filtra contenido excluido. Los resultados del CSE que no sean oficial/distribuidor
  // se conservan como cse_configured, pero nunca se presentan como "oficial".
  const filtered = enriched.filter((r) => {
    if (isExcluded(hostOf(r.url), r.title, r.snippet)) return false;
    return true;
  });

  return {
    provider: 'google',
    results: filtered.slice(0, 20),
    telemetry: {
      google_configured: Boolean(apiKey && cx),
      queries_made: queriesMade,
      google_error: primaryError,
      google_detail: primaryDetail
    }
  };
}