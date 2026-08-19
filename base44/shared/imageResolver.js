// Capa dedicada de resolución de imágenes de producto.
// Recopila candidatos de múltiples fuentes (JSON-LD, HTML, og:image,
// markdown, Tavily), los valida contra logos/banners/iconos/tracking y
// selecciona el de mayor evidencia de pertenecer al producto.
// Determinística: sin IA, sin LLM.

import { isUsableExternalImageUrl } from './extract.js';

// Patrones que indican que una imagen NO es del producto.
const REJECT_KEYWORDS = /\b(?:logo|logotype|brandmark|brand[-_ ]?mark|banner|hero[-_ ]?banner|carousel|slider|icon|favicon|nav[-_]?bar|navigation|header|footer|placeholder|sprite|tracking|pixel|beacon|spinner|loader|arrow|chevron|button|social|facebook|twitter|linkedin|instagram|youtube|whatsapp|tiktok|pinterest|share|print|cart|account|login|register|search[-_ ]?icon|menu|hamburger|close|expand|collapse|plus|minus|check|cross|tick|star[-_ ]?rating|rating|review|badge|seal|certified|award|warranty|guarantee|return|shipping[-_ ]?icon|payment|secure|ssl|visa|mastercard|paypal|amex|trust|verified|cookie|gdpr|privacy|newsletter|subscribe|email[-_ ]?icon|phone[-_ ]?icon|location[-_ ]?icon|chat|support[-_ ]?icon|help|faq)\b/i;

const REJECT_URL_PATHS = /\/(?:logo[s]?|banners?|icons?|sprites?|placeholders?|buttons?|social|favicon|headers?|footers?|nav[-_]?|menus?|cta|hero[-_]?banners?|carousels?|sliders?|backgrounds?)\//i;

const TRACKING_DIM = 2;

// Prioridad de métodos de adquisición (mayor = mejor evidencia).
const METHOD_PRIORITY = {
  jsonld_product: 100,
  html_context_pn: 85,
  html_context_manufacturer: 70,
  og_image_product_page: 50,
  tavily_result: 30,
  html_generic: 20,
  markdown_generic: 10
};

function normalizeUrlKey(url) {
  try { return new URL(url).pathname.toLowerCase().replace(/\/+$/, ''); }
  catch { return String(url || '').split('?')[0].toLowerCase().replace(/\/+$/, ''); }
}

function isRejectableImage(url, alt = '', context = '') {
  const combined = `${url || ''} ${alt || ''} ${context || ''}`;
  if (REJECT_KEYWORDS.test(combined)) return true;
  if (REJECT_URL_PATHS.test(String(url || ''))) return true;
  const dimMatch = String(url || '').match(/(\d+)x(\d+)/);
  if (dimMatch && (Number(dimMatch[1]) <= TRACKING_DIM || Number(dimMatch[2]) <= TRACKING_DIM)) return true;
  return false;
}

function resolveRelativeUrl(url, baseUrl) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  try { return new URL(url, baseUrl).href; }
  catch { return url; }
}

// JSON-LD Product image: máxima evidencia. Extrae de <script type="application/ld+json">.
function extractJsonLdProductImages(html, baseUrl) {
  const images = [];
  const scripts = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    const jsonText = script.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
    if (!jsonText) continue;
    try {
      const data = JSON.parse(jsonText);
      const nodes = Array.isArray(data) ? data : [data];
      const collect = (node) => {
        if (!node || typeof node !== 'object') return;
        const typeStr = String(node['@type'] || '');
        if (/product/i.test(typeStr)) {
          const name = String(node.name || node.sku || node.mpn || '');
          const imgs = node.image;
          if (typeof imgs === 'string') {
            images.push({ url: resolveRelativeUrl(imgs, baseUrl), alt: name, method: 'jsonld_product', context: name });
          } else if (Array.isArray(imgs)) {
            for (const img of imgs) {
              const u = typeof img === 'string' ? img : img?.url;
              if (u) images.push({ url: resolveRelativeUrl(u, baseUrl), alt: name, method: 'jsonld_product', context: name });
            }
          } else if (imgs?.url) {
            images.push({ url: resolveRelativeUrl(imgs.url, baseUrl), alt: name, method: 'jsonld_product', context: name });
          }
        }
        // @graph puede contener productos anidados.
        if (Array.isArray(node['@graph'])) node['@graph'].forEach(collect);
      };
      nodes.forEach(collect);
    } catch { /* JSON inválido → ignorar */ }
  }
  return images;
}

// Imágenes HTML <img>: extrae src, data-src, alt, title.
function extractHtmlImages(html, baseUrl) {
  const images = [];
  const tagRe = /<img\s[^>]*>/gi;
  let tagMatch;
  while ((tagMatch = tagRe.exec(String(html || '')))) {
    const tag = tagMatch[0];
    const srcMatch = tag.match(/(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const url = resolveRelativeUrl(srcMatch[1], baseUrl);
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);
    const titleMatch = tag.match(/title=["']([^"']*)["']/i);
    const alt = (altMatch?.[1] || titleMatch?.[1] || '').trim();
    images.push({ url, alt, method: 'html_generic', context: alt });
  }
  return images;
}

// Imágenes Markdown: ![alt](url)
function extractMarkdownImages(markdown, baseUrl) {
  const images = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(String(markdown || '')))) {
    images.push({ url: resolveRelativeUrl(m[2], baseUrl), alt: m[1], method: 'markdown_generic', context: m[1] });
  }
  return images;
}

// og:image / twitter:image de <meta>.
function extractOgImage(html, baseUrl) {
  const m = String(html || '').match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
    || String(html || '').match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  return m ? { url: resolveRelativeUrl(m[1], baseUrl), alt: '', method: 'og_image_product_page', context: '' } : null;
}

function scoreCandidate(candidate, productContext) {
  const { manufacturer = '', partNumber = '', query = '' } = productContext;
  const manLower = manufacturer.toLowerCase();
  const pnLower = partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
  const altLower = String(candidate.alt || candidate.context || '').toLowerCase();
  const urlLower = String(candidate.url || '').toLowerCase();
  const combined = `${altLower} ${urlLower}`;

  let score = METHOD_PRIORITY[candidate.method] || 0;

  // Bonus: alt/contexto contiene fabricante + PN → máxima evidencia contextual.
  if (manLower && pnLower && combined.includes(manLower) && combined.includes(pnLower)) {
    score += 40;
    if (candidate.method === 'html_generic') candidate.method = 'html_context_pn';
  } else if (pnLower && combined.includes(pnLower)) {
    score += 25;
    if (candidate.method === 'html_generic') candidate.method = 'html_context_pn';
  } else if (manLower && combined.includes(manLower)) {
    score += 20;
    if (candidate.method === 'html_generic') candidate.method = 'html_context_manufacturer';
  }

  // Bonus si el contexto contiene la query original.
  if (query && combined.includes(query.toLowerCase())) score += 10;

  return { ...candidate, score };
}

export function resolveProductImage(candidates, productContext) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const valid = candidates.filter((c) => {
    if (!c?.url) return false;
    if (!isUsableExternalImageUrl(c.url)) return false;
    if (isRejectableImage(c.url, c.alt, c.context)) return false;
    return true;
  });

  if (valid.length === 0) return null;

  // Deduplicar por URL (path sin query params).
  const seen = new Set();
  const unique = valid.filter((c) => {
    const key = normalizeUrlKey(c.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const scored = unique.map((c) => scoreCandidate(c, productContext));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  return {
    image_url: best.url,
    source_url: productContext.source_url || '',
    method: best.method,
    confidence: best.score,
    alt: best.alt || ''
  };
}

// Función principal: recopila candidatos de todas las fuentes disponibles
// y selecciona la mejor imagen con evidencia suficiente.
export function selectBestImage({ html, markdown, tavily_image_url, tavily_images, product_context }) {
  const ctx = product_context || {};
  const baseUrl = ctx.source_url || '';
  const candidates = [];

  // 1. JSON-LD Product image (máxima evidencia).
  if (html) candidates.push(...extractJsonLdProductImages(html, baseUrl));

  // 2. og:image de la página del producto.
  const og = html ? extractOgImage(html, baseUrl) : null;
  if (og) candidates.push(og);

  // 3. Imágenes HTML con alt/title.
  if (html) candidates.push(...extractHtmlImages(html, baseUrl));

  // 4. Imágenes Markdown del raw_content.
  if (markdown) candidates.push(...extractMarkdownImages(markdown, baseUrl));

  // 5. Imágenes proporcionadas por Tavily (último recurso).
  if (tavily_image_url) {
    candidates.push({ url: resolveRelativeUrl(tavily_image_url, baseUrl), alt: '', method: 'tavily_result', context: '' });
  }
  if (Array.isArray(tavily_images)) {
    for (const img of tavily_images) {
      const url = typeof img === 'string' ? img : img?.url;
      if (url) candidates.push({ url: resolveRelativeUrl(url, baseUrl), alt: '', method: 'tavily_result', context: '' });
    }
  }

  return resolveProductImage(candidates, ctx);
}