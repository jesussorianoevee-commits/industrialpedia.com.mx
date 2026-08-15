// Normalización determinística de valores técnicos. Sin IA, sin dependencias.
// Compartida por Ingerir y futuros jobs del pipeline.

const UNIT_MAP = {
  v: 'V', volt: 'V', volts: 'V', voltage: 'V', vdc: 'V', vac: 'V',
  a: 'A', amp: 'A', amps: 'A', amperes: 'A', ma: 'mA', aa: 'AA',
  w: 'W', watt: 'W', watts: 'W', kw: 'kW',
  hz: 'Hz', khz: 'kHz', mhz: 'MHz',
  bar: 'bar', mpa: 'MPa', pa: 'Pa', psi: 'psi',
  mm: 'mm', cm: 'cm', m: 'm', kg: 'kg', g: 'g',
  n: 'N', nm: 'Nm', rpm: 'rpm',
  c: '°C', f: '°F'
};

export function normalizeUnit(u) {
  if (!u) return '';
  const k = String(u).trim().toLowerCase().replace(/[\s.]/g, '');
  return UNIT_MAP[k] || String(u).trim();
}

// Separa "24 V" / "24V" / "0.2A" / ">=10 bar" en { value, unit }.
// Valores no numéricos (p.ej. "NPN", "M12") se conservan como valor, sin unidad.
export function splitValueUnit(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { value: '', unit: '' };
  const m = s.match(/^([<>~]?\s*[-+]?\d+(?:[.,]\d+)?)\s*([A-Za-z°²µ·/]+)?$/);
  if (m) return { value: m[1].replace(/\s/g, '').replace(',', '.'), unit: (m[2] || '').trim() };
  return { value: s, unit: '' };
}

export function normalizeValue(raw) {
  return splitValueUnit(raw).value;
}

export function normalizePartNumber(s) {
  return String(s || '').toUpperCase().replace(/[\s\-/_.]/g, '');
}