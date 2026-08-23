// Normalización conservadora de notación técnica para presentación y emparejamiento.
// No sustituye valores ni unidades: solo unifica variantes visuales cuando el contexto
// confirma que son una dimensión industrial.

const DIAMETER_SYMBOLS = /([⌀Øø∅φΦ])\s*(?=\d)/g;

export function normalizeTechnicalNotation(value, { language = 'es', display = true } = {}) {
  if (value === null || value === undefined) return value;
  let text = String(value);

  // En fichas técnicas reales aparecen φ/Φ, Ø/ø y ∅ como sustitutos del signo ⌀.
  // Solo se convierten cuando preceden un número para no alterar letras griegas ni texto normal.
  text = text.replace(DIAMETER_SYMBOLS, '⌀');

  // Variantes de micrómetro procedentes de OCR/teclados distintos.
  text = text.replace(/(?<=\d)\s*(?:μ|u)\s*m\b/gi, ' µm');

  // Multiplicación dimensional: 457 x 770 x 830 mm -> 457 × 770 × 830 mm.
  text = text.replace(/(?<=\d)\s*[xX]\s*(?=\d)/g, ' × ');

  // Espaciado legible y consistente sin modificar el valor.
  text = text.replace(/⌀\s+/g, '⌀');
  text = text.replace(/\s{2,}/g, ' ').trim();

  if (display && language === 'es') {
    // Traducciones conservadoras de frases técnicas frecuentes. No se toca el valor numérico.
    text = text
      .replace(/\bdiameter of mounting\b/gi, 'diámetro de montaje')
      .replace(/\bmounting diameter\b/gi, 'diámetro de montaje')
      .replace(/\bdiameter of mount\b/gi, 'diámetro de montaje')
      // Error recurrente de traducción/OCR en catálogos: "mounting" -> "mountain".
      .replace(/\bdiameter of mountain\b/gi, 'diámetro de montaje');
  }

  return text;
}

export function canonicalTechnicalAttribute(value) {
  const raw = String(value || '').trim().toLowerCase();
  const aliases = {
    'diameter': 'diameter', 'diametro': 'diameter', 'diámetro': 'diameter', 'dia': 'diameter', 'ø': 'diameter', '⌀': 'diameter',
    'pressure': 'pressure', 'presion': 'pressure', 'presión': 'pressure',
    'length': 'length', 'longitud': 'length', 'largo': 'length',
    'width': 'width', 'ancho': 'width',
    'height': 'height', 'alto': 'height', 'altura': 'height',
    'depth': 'depth', 'profundidad': 'depth',
    'material': 'material',
    'thread': 'thread', 'rosca': 'thread',
    'voltage': 'voltage', 'voltaje': 'voltage', 'tension': 'voltage', 'tensión': 'voltage',
    'current': 'current', 'corriente': 'current',
    'flow': 'flow', 'flujo': 'flow', 'caudal': 'flow',
    'temperature': 'temperature', 'temperatura': 'temperature'
  };
  const compact = raw.replace(/[\s_\-]+/g, ' ');
  return aliases[compact] || compact;
}
