// Descubrimiento web determinístico para BUSCAR. Sin IA ni embeddings.
// Orden: proveedor API configurado -> DuckDuckGo HTML como fallback sin clave.

const TIMEOUT_MS = 4500;
const MAX_RESULTS = 8;

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

  // Exact query first: part numbers and manufacturer+family strings are preserved.
  const exact = await bing(q);
  if (exact.length) return { provider: 'bing', results: unique(exact).slice(0, MAX_RESULTS) };

  const ddg = await duckduckgo(q);
  if (ddg.length) return { provider: 'duckduckgo', results: unique(ddg).slice(0, MAX_RESULTS) };

  return { provider: 'none', results: [] };
}

export function isLikelyIndustrialResult(r) {
  const text = `${r.title || ''} ${r.snippet || ''} ${r.url || ''}`.toLowerCase();
  return /datasheet|data.?sheet|catalog|product|part number|order(ing)? information|specification|manual|automation|industrial|sensor|valve|actuator|pneumatic|electrical|bearing|motor|plc|drive/.test(text);
}
