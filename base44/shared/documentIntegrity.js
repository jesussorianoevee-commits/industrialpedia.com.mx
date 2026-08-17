// Document Integrity Gate — barrera previa a extracción.
// Determinístico, independiente del fabricante y fail-closed.
// No repara documentos; solo determina si el payload descargado puede entrar al extractor.

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function validateDownloadedDocument({ bytes, contentType = '', url = '' }) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const ct = String(contentType || '').toLowerCase();
  const lowerUrl = String(url || '').toLowerCase();
  const hash = await sha256Hex(data);
  const errors = [];

  if (!data.length) errors.push('empty_payload');
  if (data.length > MAX_DOCUMENT_BYTES) errors.push('document_too_large');

  const looksPdf = lowerUrl.endsWith('.pdf') || ct.includes('application/pdf') ||
    (data.length >= 5 && new TextDecoder().decode(data.slice(0, 5)) === '%PDF-');

  if (looksPdf) {
    const header = data.length >= 5 ? new TextDecoder().decode(data.slice(0, 5)) : '';
    if (header !== '%PDF-') errors.push('invalid_pdf_header');
    if (data.length < 1024) errors.push('pdf_payload_suspiciously_small');
    const tail = data.length >= 32 ? new TextDecoder().decode(data.slice(Math.max(0, data.length - 2048))) : '';
    if (!/%%EOF\s*$/m.test(tail)) errors.push('pdf_eof_marker_missing');
  } else {
    const isHtml = ct.includes('text/html') || /\.(?:html?|xhtml)(?:$|[?#])/i.test(lowerUrl);
    if (isHtml && !String(new TextDecoder().decode(data.slice(0, Math.min(data.length, 8192)))).trim()) {
      errors.push('empty_html_payload');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    content_hash: hash,
    byte_length: data.length,
    detected_pdf: looksPdf
  };
}
