// Normalización Unicode-safe para identificadores técnicos.
// Determinística, sin IA y no destructiva para letras/números Unicode.
// IMPORTANTE: esta utilidad está preparada inicialmente para ejecución shadow.

export function normalizeIdentifierUnicode(value) {
  // NFC preserva los caracteres visibles y compone secuencias equivalentes.
  // No translitera α/β/γ a ASCII y no elimina letras/números no ASCII.
  return String(value ?? '')
    .normalize('NFC')
    .toUpperCase()
    .replace(/[\s\-/_.]+/gu, '');
}

export function isUnicodeTechnicalIdentifier(value, { minLength = 2, maxLength = 40, requireDigit = true } = {}) {
  const s = String(value ?? '').trim().normalize('NFC');
  if (!s || /\s/u.test(s)) return false;
  if ([...s].length < minLength || [...s].length > maxLength) return false;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\-/_.]*$/u.test(s)) return false;
  if (requireDigit && !/\p{N}/u.test(s)) return false;
  return true;
}

export function unicodeSignature(token) {
  let sig = '';
  for (const ch of String(token ?? '').normalize('NFC')) {
    if (/\p{L}/u.test(ch)) sig += 'A';
    else if (/\p{N}/u.test(ch)) sig += 'N';
    else sig += ch;
  }
  return sig;
}
