// Plantillas determinísticas de ficha técnica por tipo de componente.
// Sin IA. La detección de tipo se basa en palabras clave observables en el
// título/descripción/especificaciones. Las plantillas solo agrupan y etiquetan
// campos esperados; NUNCA inventan valores (los ausentes se marcan "No disponible").

const TYPE_KEYWORDS = [
  {
    type: 'cylinder',
    label: 'Cilindro neumático/hidráulico',
    patterns: /\b(?:cili?ndro|cylinder|pneumatic|hydraulic|actuador lineal|linear actuator|DSNU|ADN|ADVU|DSNU|DGO|carrera|stroke)\b/i,
    fields: [
      { key: 'diameter', label: 'Diámetro', match: /\b(?:diam|bores?|piston\s+diam|Ø|d)\b/i },
      { key: 'stroke', label: 'Carrera', match: /\b(?:stroke|carrera|recorrido)\b/i },
      { key: 'pressure', label: 'Presión de operación', match: /\b(?:pressure|presi[oó]n|operating\s+pressure)\b/i },
      { key: 'temperature', label: 'Temperatura', match: /\b(?:temp|temperatura)\b/i },
      { key: 'connections', label: 'Conexiones', match: /\b(?:connection|conexi[oó]n|port|thread|rosc)\b/i },
      { key: 'material', label: 'Material', match: /\b(?:material)\b/i },
      { key: 'mounting', label: 'Montaje', match: /\b(?:mount|montaje|fixing)\b/i },
      { key: 'weight', label: 'Peso', match: /\b(?:weight|peso|mass)\b/i }
    ]
  },
  {
    type: 'sensor',
    label: 'Sensor',
    patterns: /\b(?:sensor|inductive|capacitive|photoelectric|magnetic|proximity|detector|BES|BNS|FE|RTD|thermocouple)\b/i,
    fields: [
      { key: 'detection_distance', label: 'Distancia de detección', match: /\b(?:sensing|detection|distance|distancia|range|alcance|nominal)\b/i },
      { key: 'supply', label: 'Alimentación', match: /\b(?:supply|alimentaci|voltage|tensio|vcc|ubb|operating\s+v)\b/i },
      { key: 'output', label: 'Salida', match: /\b(?:output|salida|switching|npn|pnp|relay|signal)\b/i },
      { key: 'frequency', label: 'Frecuencia', match: /\b(?:frequency|frecuencia|switching\s+frequency)\b/i },
      { key: 'ip', label: 'Protección IP', match: /\b(?:ip\s*\d|ingress|protection|protecci)\b/i },
      { key: 'temperature', label: 'Temperatura', match: /\b(?:temp|temperatura)\b/i },
      { key: 'connection', label: 'Conexión', match: /\b(?:connection|conexi|cable|connector|conector|plug)\b/i }
    ]
  },
  {
    type: 'bearing',
    label: 'Rodamiento',
    patterns: /\b(?:bearing|rodamiento|ball\s+bearing|roller|angular\s+contact)\b/i,
    fields: [
      { key: 'inner', label: 'Diámetro interior', match: /\b(?:inner|interior|bore|d\s*inner)\b/i },
      { key: 'outer', label: 'Diámetro exterior', match: /\b(?:outer|exterior|outside)\b/i },
      { key: 'width', label: 'Ancho', match: /\b(?:width|ancho|w\b)\b/i },
      { key: 'sealing', label: 'Sellado', match: /\b(?:seal|sellado|2rs|zz|shield)\b/i },
      { key: 'dynamic_load', label: 'Carga dinámica', match: /\b(?:dynamic|carga\s+din|cr\b)\b/i },
      { key: 'static_load', label: 'Carga estática', match: /\b(?:static|carga\s+est|c0\b)\b/i },
      { key: 'speed', label: 'Velocidad límite', match: /\b(?:speed|velocidad|limiting|n\s*lim)\b/i },
      { key: 'material', label: 'Material', match: /\b(?:material|steel|acero)\b/i }
    ]
  },
  {
    type: 'plc',
    label: 'PLC / Controlador',
    patterns: /\b(?:plc|controller|controlador|cpu|module|m[oó]dulo|6ES7|6AV|6EP)\b/i,
    fields: [
      { key: 'supply', label: 'Alimentación', match: /\b(?:supply|alimentaci|voltage|tensio|vcc)\b/i },
      { key: 'inputs', label: 'Entradas', match: /\b(?:input|entrada|di\b)\b/i },
      { key: 'outputs', label: 'Salidas', match: /\b(?:output|salida|do\b|dq\b)\b/i },
      { key: 'memory', label: 'Memoria', match: /\b(?:memory|memoria|work\s+memory)\b/i },
      { key: 'temperature', label: 'Temperatura', match: /\b(?:temp|temperatura)\b/i },
      { key: 'communication', label: 'Comunicación', match: /\b(?:communication|comunicaci|interface|ethernet|profibus|profinet|modbus)\b/i }
    ]
  },
  {
    type: 'valve',
    label: 'Válvula',
    patterns: /\b(?:valve|v[áa]lvula|solenoid|electrov|directional)\b/i,
    fields: [
      { key: 'pressure', label: 'Presión', match: /\b(?:pressure|presi[oó]n)\b/i },
      { key: 'flow', label: 'Caudal', match: /\b(?:flow|caudal|cv\b|kvs)\b/i },
      { key: 'supply', label: 'Alimentación', match: /\b(?:supply|alimentaci|voltage|tensio)\b/i },
      { key: 'orifice', label: 'Orificio', match: /\b(?:orifice|orificio|nominal)\b/i },
      { key: 'ip', label: 'Protección IP', match: /\b(?:ip\s*\d|protection|protecci)\b/i },
      { key: 'temperature', label: 'Temperatura', match: /\b(?:temp|temperatura)\b/i }
    ]
  },
  {
    type: 'motor',
    label: 'Motor',
    patterns: /\b(?:motor|servomotor|stepper|paso a paso|drive|frequency\s+converter|inverter)\b/i,
    fields: [
      { key: 'power', label: 'Potencia', match: /\b(?:power|potencia)\b/i },
      { key: 'voltage', label: 'Tensión', match: /\b(?:voltage|tensio|v\b)\b/i },
      { key: 'current', label: 'Corriente', match: /\b(?:current|corriente|amp)\b/i },
      { key: 'speed', label: 'Velocidad', match: /\b(?:speed|velocidad|rpm)\b/i },
      { key: 'torque', label: 'Par', match: /\b(?:torque|par|nm\b)\b/i },
      { key: 'temperature', label: 'Temperatura', match: /\b(?:temp|temperatura)\b/i },
      { key: 'ip', label: 'Protección IP', match: /\b(?:ip\s*\d|protection|protecci)\b/i }
    ]
  }
];

export function detectComponentType(text) {
  const corpus = String(text || '');
  for (const t of TYPE_KEYWORDS) {
    if (t.patterns.test(corpus)) return { type: t.type, label: t.label, fields: t.fields };
  }
  return { type: 'general', label: 'Componente industrial', fields: [] };
}

// Agrupa especificaciones en los campos de la plantilla del tipo detectado.
// Las specs que no encajan van a "Otras especificaciones". Nunca inventa valores.
export function groupSpecsByTemplate(specs, template) {
  const fields = template.fields || [];
  const used = new Set();
  const grouped = fields.map((f) => {
    const match = specs.find((s, i) => {
      if (used.has(i)) return false;
      const attr = String(s.attribute || '').toLowerCase();
      const val = String(s.original_value || '').toLowerCase();
      const combo = `${attr} ${val}`;
      return f.match.test(combo) && (used.add(i), true);
    });
    if (match) {
      return {
        key: f.key,
        label: f.label,
        value: match.normalized_value ?? match.original_value ?? ''
        unit: match.normalized_unit ?? match.original_unit ?? ''
        attribute_name: match.attribute_name,
        evidence: match.evidence,
        available: true
      };
    }
    return { key: f.key, label: f.label, value: '', unit: '', available: false };
  });
  const others = specs.filter((s, i) => !used.has(i)).map((s) => ({
    label: s.attribute_name || s.attribute,
    value: s.normalized_value ?? s.original_value ?? '',
    unit: s.normalized_unit ?? s.original_unit ?? '',
    evidence: s.evidence,
    available: true
  }));
  return { grouped, others };
}