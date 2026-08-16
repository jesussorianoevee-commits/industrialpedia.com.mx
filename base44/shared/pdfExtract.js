// Extracción de texto PDF determinística (sin OCR, sin IA) vía `unpdf` (PDF.js para runtime edge/Deno).
// Conserva páginas separando por el form-feed (\f) que inserta el renderer.
import { getDocumentProxy, extractText } from 'npm:unpdf';

export async function extractPDF(data) {
  // unpdf getDocumentProxy recibe el buffer directamente (Uint8Array/ArrayBuffer), no envuelto.
  const pdf = await getDocumentProxy(data);
  const r = await extractText(pdf, { mergePages: true });
  const full = typeof r === 'string' ? r : String((r && r.text) || '');
  const pages = full.split(/\f/);
  return { extractable: true, text: full, pages, totalPages: (r && r.totalPages) || pages.length };
}