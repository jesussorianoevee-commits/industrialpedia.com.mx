// Descubrimiento web determinístico para BUSCAR. Sin IA ni embeddings.
// Orden: proveedor API configurado -> DuckDuckGo HTML como fallback sin clave.

const TIMEOUT_MS = 9000;
const MAX_RESULTS = 50;

function stripHtml(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function decodeUrl(raw) {
  try {
    const u = new URL(raw, 'https://html.duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : u.href;
  } catch { return raw; }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally { clearTimeout(timer); }
}

async function googleCustomSearch(query) {
  // Google Programmable Search / Custom Search JSON API. No IA: devuelve
  // resultados web directamente. Soporta varios nombres habituales de secretos
  // para no obligar a cambiar la configuración de Base44.
  const key = Deno.env.get('GOOGLE_SEARCH_API_KEY') || Deno.env.get('GOOGLE_CUSTOM_SEARCH_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || '';
  const cx = Deno.env.get('GOOGLE_CSE_ID') || Deno.env.get('GOOGLE_SEARCH_ENGINE_ID') || Deno.env.get('GOOGLE_CX') || '';
  if (!key || !cx) return [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=10`;
    const r = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.items || []).slice(0, 10).map((x) => ({
      title: x.title || '', url: x.link || '', snippet: x.snippet || '', provider: 'google'
    })).filter((x) => x.url);
  } catch { return []; }
}

async function bing(query) {
  const key = Deno.env.get('BING_SEARCH_API_KEY') || '';
  if (!key) return [];
  try {
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${MAX_RESULTS}&responseFilter=Webpages`;
    const r = await fetchWithTimeout(url, { headers: { 'Ocp-Apim-Subscription-Key': key, Accept: 'application/json' } });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.webPages?.value || []).slice(0, MAX_RESULTS).map((x) => ({
      title: x.name || '', url: x.url || '', snippet: x.snippet || '', provider: 'bing'
    })).filter((x) => x.url);
  } catch { return []; }
}

async function duckduckgo(query) {
  try {
    const r = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IndustrialpediaSearch/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.8'
      }
    });
    if (!r.ok) return [];
    const html = await r.text();
    const out = [];
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) && out.length < MAX_RESULTS) {
      const attrs = m[1] || '';
      if (!/class=[\"'][^\"']*result__a[^\"']*[\"']/i.test(attrs)) continue;
      const href = attrs.match(/href=[\"']([^\"']+)[\"']/i);
      if (!href) continue;
      const url = decodeUrl(href[1]);
      const title = stripHtml(m[2]);
      if (!/^https?:\/\//i.test(url) || !title) continue;
      out.push({ title, url, snippet: '', provider: 'duckduckgo' });
    }
    return out;
  } catch { return []; }
}

function unique(results) {
  const seen = new Set();
  return results.filter((r) => {
    const key = String(r.url || '').replace(/#.*$/, '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export async function discoverIndustrialWeb(query) {
  const q = String(query || '').trim();
  if (!q) return { provider: 'none', results: [] };

  // Primero intentamos Google si el secreto de búsqueda y el ID del motor están
  // configurados. Se hacen varias consultas complementarias y se combinan sin IA.
  const searchQueries = [
    q,
    `${q} datasheet`,
    `${q} product catalog`
  ];

  const googleBatches = await Promise.all(searchQueries.map((term) => googleCustomSearch(term)));
  const googleResults = unique(googleBatches.flat());
  if (googleResults.length) return { provider: 'google', results: googleResults.slice(0, MAX_RESULTS) };

  // Bing queda como segundo proveedor si Google no está configurado o no devuelve
  // resultados útiles; DuckDuckGo permanece como último fallback.
  const bingBatches = await Promise.all(searchQueries.map((term) => bing(term)));
  const bingResults = unique(bingBatches.flat());
  if (bingResults.length) return { provider: 'bing', results: bingResults.slice(0, MAX_RESULTS) };

  const ddg = await duckduckgo(q);
  if (ddg.length) return { provider: 'duckduckgo', results: unique(ddg).slice(0, MAX_RESULTS) };

  return { provider: 'none', results: [] };
}

const TRUSTED_DISTRIBUTOR_DOMAINS = new Set([
  'mouser.com', 'digikey.com', 'newark.com', 'element14.com', 'farnell.com',
  'rs-online.com', 'automationdirect.com', 'grainger.com', 'misumi.com',
  'mcmaster.com', 'tme.eu', 'radwell.com', 'galco.com', 'alliedelec.com',
  'arrow.com', 'avnet.com', 'octopart.com'
]);

const SUSPICIOUS_HOST_TERMS = /(^|[.-])(repair|repairs|used|surplus|salvage|auction|classifieds|marketplace|forum|forums|blog|review|reviews)([.-]|$)/i;

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function registrableHost(host) {
  const parts = host.split('.').filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('.') : host;
}

function domainMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function brandHostMatches(host, manufacturerNames = []) {
  const base = registrableHost(host).split('.')[0].replace(/[^a-z0-9]/g, '');
  if (!base || SUSPICIOUS_HOST_TERMS.test(host)) return false;
  return manufacturerNames.some((name) => {
    const token = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!token || token.length < 3) return false;
    return base === token || base.startsWith(token) || token.startsWith(base);
  });
}

// No depende de una lista cerrada de fabricantes. Para una marca que todavía
// no exista en Manufacturer, BUSCAR puede reconocer su dominio oficial cuando
// el nombre de la marca aparece explícitamente en la consulta.
export function manufacturerTokensFromQuery(query, looksLikePartNumberFn = () => false) {
  return String(query || '')
    .split(/[^A-Za-z0-9&.-]+/)
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((token) => token.length >= 3)
    .filter((token) => !looksLikePartNumberFn(token))
    .filter((token) => !/^(industrial|products?|product|part|parts|number|catalog|catalogue|datasheet|sensor|sensors|valve|valves|motor|motors|pneumatic|electrical|automation|component|components|refaccion|refacciones|repuesto|repuestos)$/i.test(token));
}

export function classifyIndustrialSource(r, manufacturerNames = [], trustedOfficialDomains = []) {
  const host = hostOf(r.url);
  if (!host || SUSPICIOUS_HOST_TERMS.test(host)) return 'untrusted';
  if (trustedOfficialDomains.some((d) => d && domainMatches(host, String(d).toLowerCase().replace(/^www\./, '')))) return 'official';
  if ([...TRUSTED_DISTRIBUTOR_DOMAINS].some((d) => domainMatches(host, d))) return 'distributor';
  if (brandHostMatches(host, manufacturerNames)) return 'official';
  return 'untrusted';
}

export function isLikelyIndustrialResult(r) {
  const text = `${r.title || ''} ${r.snippet || ''} ${r.url || ''}`.toLowerCase();
  return /datasheet|data.?sheet|catalog|product|part number|order(ing)? information|specification|manual|automation|industrial|sensor|valve|actuator|pneumatic|electrical|bearing|motor|plc|drive/.test(text);
}

export function filterTrustedIndustrialResults(results, manufacturerNames = [], trustedOfficialDomains = []) {
  return results
    .map((r) => ({ ...r, source_type: classifyIndustrialSource(r, manufacturerNames, trustedOfficialDomains) }))
    .filter((r) => r.source_type === 'official' || r.source_type === 'distributor');
}
