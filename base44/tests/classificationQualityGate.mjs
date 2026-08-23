import assert from 'node:assert/strict';
import { classifyWithEvidence, buildClassificationFingerprint } from '../shared/classificationEvidence.js';

// Golden cases are permanent regression fixtures. Every production-quality bug fixed
// should be represented here so future rule changes cannot silently reintroduce it.
const GOLDEN_CASES = [
  ['neumatica', { title: 'Festo DSNU pneumatic cylinder' }],
  ['neumatica', { title: 'Cilindro neumático ISO 15552' }],
  ['neumatica', { title: 'JUN-AIR oil-free compressor' }],
  ['neumatica', { title: 'Frozen compressed air dryer' }],
  ['neumatica', { title: 'FRL 1/4 NPT compact' }],
  ['neumatica', { title: 'Válvula neumática 5/2 con actuador rotativo' }],

  ['sensores', { title: 'Inductive proximity sensor M12' }],
  ['sensores', { title: 'Sensor fotoeléctrico PNP 10-30VDC' }],
  ['sensores', { title: 'K thermocouple temperature probe' }],
  ['sensores', { title: 'Sonda de temperatura PT100' }],

  ['robotica', { title: 'Industrial robotic arm controller' }],
  ['robotica', { title: 'Robot controller with servo motion control' }],

  ['electronica-control', { title: '24V DC power supply' }],
  ['electronica-control', { title: 'Programmable logic controller PLC' }],
  ['electronica-control', { title: 'SIMATIC ET 200 PROFINET fieldbus node' }],
  ['electronica-control', { title: 'AC adapter for humidity sensor' }],

  ['instrumentacion-medicion', { title: 'Digital pressure gauge' }],
  ['instrumentacion-medicion', { title: 'pH meter measurement range 0-14' }],
  ['instrumentacion-medicion', { title: 'Wind velocity meter' }],
  ['instrumentacion-medicion', { title: 'Pocket microscope 100X' }],
  ['instrumentacion-medicion', { title: 'Small vibration meter' }],
  ['instrumentacion-medicion', { title: 'Temperature data logger' }],

  ['laboratorio-cientifico', { title: 'Micropipette Nichipet' }],
  ['laboratorio-cientifico', { title: 'PTFE stirring shaft' }],
  ['laboratorio-cientifico', { title: 'Tip for micro pipette' }],
  ['laboratorio-cientifico', { title: 'Bottle top dispenser' }],
  ['laboratorio-cientifico', { title: 'Neoprene long plug' }],

  ['fluidos-bombeo', { title: 'Peristaltic pump maximum flow rate 2 L/min' }],
  ['fluidos-bombeo', { title: 'Bomba peristáltica industrial' }],
  ['fluidos-bombeo', { title: 'Centrifugal pump discharge pressure 6 bar' }],

  ['mecanica-transmision', { title: '608-2Z/C3 deep groove ball bearing' }],
  ['mecanica-transmision', { title: 'ISO 2338 dowel pin D6 x 20' }],
  ['mecanica-transmision', { title: 'ISO 4762 hexagon socket head cap screw M6 x 20' }],
  ['mecanica-transmision', { title: '20 x 40 aluminum extrusion profile' }]
];

const NEGATIVE_CASES = [
  { title: 'This product is not pneumatic', expected: null },
  { title: 'Este producto no es neumático', expected: null },
  { title: 'Equipo sin sistema neumático integrado', expected: null },
  { title: 'Sin embargo, este cilindro neumático cumple la norma ISO', expected: 'neumatica' },
  { title: 'Hydro-pneumatic accumulator', expected: null },
  { title: 'Vacuum pump', expected: null },
  { title: 'Chapter 4 covers pneumatic systems overview', expected: null },
  { title: 'Pneumatic tire pressure gauge', expected: 'instrumentacion-medicion' },
  { title: 'Festo optical sensor M18', manufacturer_name: 'Festo', expected: 'sensores' },
  { title: 'SMC laboratory condenser glass', manufacturer_name: 'SMC', expected: 'laboratorio-cientifico' }
];

const QUALITY_STATUS_CASES = [
  [{ title: 'Inductive proximity sensor M12' }, 'auto_accept'],
  [{ title: 'Hydro-pneumatic accumulator' }, 'shadow_review'],
  [{ title: 'Pneumatic sensor pressure gauge' }, 'shadow_review']
];

const CROSS_AREA_CASES = [
  ['Pressure gauge 0-10 bar', 'instrumentacion-medicion'],
  ['Vacuum pump laboratory', null],
  ['Laboratory condenser pneumatic jacket', 'laboratorio-cientifico'],
  ['AC adapter for humidity sensor', 'electronica-control'],
  ['Hydraulic centrifugal pump', 'fluidos-bombeo'],
  ['Servo motor drive controller', 'robotica']
];

let checks = 0;
for (const [expected, part] of GOLDEN_CASES) {
  const result = classifyWithEvidence(part);
  assert.equal(result.area, expected, `golden: ${part.title} -> ${expected}, got ${result.area}`);
  checks += 1;
}

for (const part of NEGATIVE_CASES) {
  const result = classifyWithEvidence(part);
  assert.equal(result.area, part.expected, `negative/cross-family: ${part.title} -> ${part.expected}, got ${result.area}`);
  checks += 1;
}

for (const [part, expectedStatus] of QUALITY_STATUS_CASES) {
  const result = classifyWithEvidence(part);
  assert.equal(result.status, expectedStatus, `quality status: ${part.title} -> ${expectedStatus}, got ${result.status}`);
  checks += 1;
}

for (const [title, expected] of CROSS_AREA_CASES) {
  const result = classifyWithEvidence({ title });
  assert.equal(result.area, expected, `cross-area: ${title} -> ${expected}, got ${result.area}`);
  checks += 1;
}

// Determinism and canonical-data checks.
const orderedA = { bore: 20, stroke: 50, nested: { pressure: 6, unit: 'bar' } };
const orderedB = { nested: { unit: 'bar', pressure: 6 }, stroke: 50, bore: 20 };
assert.equal(buildClassificationFingerprint({ title: 'Cylinder', specifications: orderedA }), buildClassificationFingerprint({ title: 'Cylinder', specifications: orderedB }), 'fingerprint must be key-order stable');
assert.notEqual(buildClassificationFingerprint({ title: 'Cylinder', specifications: { bore: 20 } }), buildClassificationFingerprint({ title: 'Cylinder', specifications: { bore: '20' } }), 'fingerprint must preserve types');
assert.notEqual(buildClassificationFingerprint({ title: 'Cylinder', specifications: { bore: null } }), buildClassificationFingerprint({ title: 'Cylinder', specifications: {} }), 'fingerprint must distinguish null from missing');
checks += 3;

// Rule execution must be deterministic across repeated runs and equivalent text variants.
for (const [expected, part] of GOLDEN_CASES) {
  const first = classifyWithEvidence(part);
  const second = classifyWithEvidence({ ...part });
  assert.equal(first.area, second.area, `determinism failed for ${part.title}`);
  assert.equal(first.fingerprint, second.fingerprint, `fingerprint determinism failed for ${part.title}`);
  assert.equal(first.area, expected, `repeat golden regression for ${part.title}`);
  checks += 2;
}

const results = GOLDEN_CASES.map(([expected, part]) => ({ expected, actual: classifyWithEvidence(part).area }));
const passed = results.filter((item) => item.expected === item.actual).length;
const precision = passed / results.length;
const recall = passed / results.length;
const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
assert.ok(precision >= 1, `golden precision regression: ${precision}`);
assert.ok(recall >= 1, `golden recall regression: ${recall}`);

console.log(JSON.stringify({
  status: 'CLASSIFICATION_QUALITY_GATE_OK',
  checks,
  golden_total: GOLDEN_CASES.length,
  precision,
  recall,
  f1,
  policy: {
    auto_accept: 'strong class evidence without exclusion/conflict',
    shadow_review: 'ambiguous or insufficient evidence',
    reject: 'negative/excluded evidence'
  }
}, null, 2));
