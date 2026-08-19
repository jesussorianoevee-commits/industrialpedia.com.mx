// Tavily Search + clasificación determinística de fuentes industriales.
// Sin respuestas generativas. Sin escrituras en base de datos.
// Tavily es la capa de descubrimiento web; Industrialpedia conserva el filtrado y ranking.

const TIMEOUT_MS = 15000;

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

function classifySource(host, brand, queryBrandTokens) {
  if (!host) return 'untrusted';
  if ([...TRUSTED_DISTRIBUTOR_DOMAINS].some((d) => domainMatches(host, d))) return 'distributor';
  const base = domainBaseToken(host);
  if (brand && normalizeBrand(brand) === base) return 'official';
  if (queryBrandTokens.some((t) => normalizeBrand(t) === base)) return 'official';
  return 'web_discovery';
}

function extractBrandFromContent(content, queryBrandTokens) {
  const text = String(content || '').toLowerCase();
  const hit = queryBrandTokens.find((t) => text.includes(t.toLowerCase()));
  return hit || '';
}

function isPartNumberQuery(q) {
  const v = String(q || '').trim();
  if (!v) return false;
  const tokens = v.split(/\s+/);
  if (tokens.length === 1) return /[A-Za-z]/.test(v) && /\d/.test(v) && v.length >= 3 && v.length <= 40;
  return tokens.length <= 3 && tokens.some((t) => /[A-Za-z]/.test(t) && /\d/.test(t));
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
      include_raw_content: false,
      include_images: false,
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
    return { results: Array.isArray(data.results) ? data.results : [], error: null, detail: null };
  } catch (e) {
    if (e?.name === 'AbortError') return { results: [], error: 'tavily_timeout', detail: 'La consulta excedió el tiempo límite' };
    return { results: [], error: `tavily_exception_${e?.name || 'unknown'}`, detail: String(e?.message || '').slice(0, 500) };
  }
}

export async function discoverTavilyIndustrial(query, apiKey) {
  const q = String(query || '').trim();
  if (!q) return { provider: 'none', results: [], telemetry: { configured: Boolean(apiKey), queries_made: 0, error: null, detail: null } };

  const queryBrandTokens = brandTokensFromQuery(q);
  const partLike = isPartNumberQuery(q);
  const batch = await tavilySearch(q, apiKey, { max_results: 10 });
  let queriesMade = 1;
  let primaryError = batch.error;
  let primaryDetail = batch.detail;
  let items = batch.results;

  if (!items.length && !primaryError) {
    const fallbackQuery = partLike ? `${q} datasheet` : `${q} datasheet specifications`;
    const fb = await tavilySearch(fallbackQuery, apiKey, { max_results: 10 });
    queriesMade++;
    if (fb.error && !primaryError) { primaryError = fb.error; primaryDetail = fb.detail; }
    items = fb.results;
  }

  const enriched = items.map((item) => {
    const host = hostOf(item.url);
    const title = item.title || '';
    const snippet = item.content || '';
    const brand = extractBrandFromContent(`${title} ${snippet}`, queryBrandTokens);
    const sourceType = classifySource(host, brand, queryBrandTokens);
    const partNumber = partLike ? q : '';
    return {
      title,
      url: item.url,
      display_link: host,
      snippet,
      source_type: sourceType,
      image_url: '',
      manufacturer_name: brand || (queryBrandTokens.length === 1 ? queryBrandTokens[0] : ''),
      part_number: partNumber,
      product_name: title,
      description: snippet,
      is_pdf: /\.pdf(?:$|[?#])/i.test(item.url || ''),
      provider: 'tavily',
      relevance_score: typeof item.score === 'number' ? item.score : null
    };
  });

  const filtered = enriched.filter((r) => !isExcluded(hostOf(r.url), r.title, r.snippet));
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
