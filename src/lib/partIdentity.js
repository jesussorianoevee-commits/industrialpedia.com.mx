// Resuelve únicamente la identidad de presentación. No modifica el dato canónico.
// Algunos catálogos publican como "part_number" un modelo/medida (p. ej. 150mm)
// aunque el nombre del producto contiene el código comercial real.

export function isWeakPartReference(value) {
  const ref = String(value || '').trim();
  if (!ref) return true;

  // Una medida pura no es una referencia estable para identificar un componente.
  return /^\d+(?:[.,]\d+)?\s*(?:mm|cm|m|µm|um|in|inch|inches|φ\s*\d+(?:[.,]\d+)?)$/i.test(ref);
}

export function extractCodeLikeReference(name) {
  const text = String(name || '').trim();
  if (!text) return '';

  // Códigos comerciales del tipo 1-9685-01, 68-6669-35, etc.
  // Exigimos al menos dos grupos separados por guiones para no confundir
  // dimensiones o palabras sueltas con una referencia de producto.
  const match = text.match(/(?:^|\s)(\d{1,4}(?:-\d{1,6}){1,3})(?=\s|$)/);
  return match?.[1] || '';
}

export function getDisplayPartReference(part = {}) {
  const canonical = String(part.part_number || '').trim();
  if (!isWeakPartReference(canonical)) return canonical;

  const codeFromName = extractCodeLikeReference(part.name || part.title || part.product_name || '');
  return codeFromName || canonical;
}
