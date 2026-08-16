// Reglas determinísticas del crawler industrial. Sin IA, sin dependencias.
// Genéricas para cualquier fabricante: ningún dominio es caso especial.

export function normalizeUrl(u) {
  try {
    const url = new URL(String(u || ''));
    let path = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    return (url.origin + path + (url.search || '')).toLowerCase();
  } catch {
    return String(u || '').toLowerCase().trim();
  }
}

export function domainOf(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ''; }
}

export function isAllowedDomain(u, source) {
  const host = domainOf(u);
  if (!host) return false;
  const allowed = [source.domain, ...(source.subdomains || [])].map((d) => String(d).toLowerCase());
  return allowed.some((d) => host === d || host.endsWith('.' + d));
}

export function isPathAllowed(u, source) {
  try {
    const path = new URL(u).pathname.toLowerCase();
    const deny = (source.deny_paths || []).map((p) => p.toLowerCase());
    if (deny.some((p) => path.startsWith(p))) return false;
    const allow = source.allow_paths || [];
    if (allow.length === 0) return true;
    return allow.some((p) => path.startsWith(p.toLowerCase()));
  } catch { return false; }
}

export function matchesPatterns(u, source) {
  const pats = source.url_patterns || [];
  if (!pats.length) return true;
  return pats.some((p) => { try { return new RegExp(p, 'i').test(u); } catch { return false; } });
}

// Tipo determinístico por extensión + content-type.
export function detectType(u, contentType) {
  const ct = String(contentType || '').toLowerCase();
  const p = String(u || '').toLowerCase();
  if (ct.includes('pdf') || p.endsWith('.pdf')) return 'pdf';
  if (p.includes('datasheet')) return 'datasheet';
  if (p.includes('manual')) return 'manual';
  if (p.includes('catalog') || p.includes('catalogue')) return 'catalog';
  if (p.includes('/product') || p.includes('/p/')) return 'product_page';
  if (ct.includes('text/html')) return 'page';
  return 'unknown';
}

export function isDocumentType(type, source) {
  const allowed = source.allowed_content_types || [];
  if (!allowed.length) return ['pdf', 'datasheet', 'manual', 'catalog'].includes(type);
  return allowed.includes(type);
}

// robots.txt: consolida reglas para User-agent: * y nuestro crawler.
export function parseRobots(text) {
  const lines = String(text || '').split('\n');
  let uaRelevant = false;
  const disallow = [], allow = [];
  for (let line of lines) {
    line = line.split('#')[0].trim();
    if (!line) continue;
    const m = line.match(/^(User-agent|Allow|Disallow):\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      uaRelevant = (val === '*' || val.toLowerCase().includes('industrialpedia'));
    } else if (uaRelevant) {
      if (key === 'disallow' && val) disallow.push(val);
      else if (key === 'allow' && val) allow.push(val);
    }
  }
  return { disallow, allow };
}

export function isRobotsAllowed(u, robots) {
  if (!robots || !robots.disallow || !robots.disallow.length) return true;
  try {
    const url = new URL(u);
    const path = url.pathname + url.search;
    for (const d of robots.disallow) {
      if (path.startsWith(d)) return false;
    }
    return true;
  } catch { return true; }
}

export function extractLinks(baseUrl, html) {
  const out = [];
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html || ''))) {
    try { out.push(new URL(m[1], baseUrl).href); } catch {}
  }
  return out;
}

export async function sha256(buf) {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}