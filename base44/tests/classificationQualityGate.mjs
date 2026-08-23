import assert from 'node:assert/strict';
import { classifyWithEvidence, buildClassificationFingerprint } from '../shared/classificationEvidence.js';

const GOLDEN_CASES = [
  ['neumatica', { title: 'Festo DSNU pneumatic cylinder' }],
  ['neumatica', { title: 'Cilindro neumático ISO 15552' }],
  ['neumatica', { title: 'JUN-AIR oil-free compressor' }],
  ['neumatica', { title: 'FRL 1/4 NPT compact' }],
  ['sensores', { title: 'Inductive proximity sensor M12' }],
  ['sensores', { title: 'K thermocouple temperature probe' }],
  ['robotica', { title: 'Industrial robotic arm controller' }],
  ['electronica-control', { title: '24V DC power supply' }],
  ['electronica-control', { title: 'Programmable logic controller PLC' }],
  ['instrumentacion-medicion', { title: 'Digital pressure gauge' }],
  ['laboratorio-cientifico', { title: 'Micropipette Nichipet' }],
  ['laboratorio-cientifico', { title: 'PTFE stirring shaft' }],
  ['fluidos-bombeo', { title: 'Peristaltic pump maximum flow rate 2 L/min' }],
  ['fluidos-bombeo', { title: 'Bomba peristáltica industrial' }]
];

const NEGATIVE_CASES = [
  { title: 'This product is not pneumatic' },
  { title: 'Este producto no es neumático' },
  { title: 'Equipo sin sistema neumático integrado' },
  { title: 'Hydro-pneumatic accumulator' },
  { title: 'Pneumatic tire pressure gauge' },
  { title: 'Vacuum pump' },
  { title: 'Chapter 4 covers pneumatic systems overview' }
];

const CROSS_AREA_CASES = [
  ['sensores', { title: 'Pressure gauge 0-10 bar' }, 'instrumentacion-medicion'],
  ['fluidos-bombeo', { title: 'Vacuum pump laboratory' }, null],
  ['neumatica', { title: 'Laboratory condenser pneumatic jacket' }, 'laboratorio-cientifico'],
  ['electronica-control', { title: 'AC adapter for humidity sensor' }, 'electronica-control']
];

let checks = 0;
for (const [expected, part] of GOLDEN_CASES) {
  const result = classifyWithEvidence(part);
  assert.equal(result.area, expected, `golden: ${part.title} -> ${expected}, got ${result.area}`);
  checks += 1;
}

for (const part of NEGATIVE_CASES) {
  const result = classifyWithEvidence(part);
  assert.equal(result.area, null, `negative: ${part.title} should remain unclassified, got ${result.area}`);
  checks += 1;
}

for (const [, part, expected] of CROSS_AREA_CASES) {
  const result = classifyWithEvidence(part);
  assert.equal(result.area, expected, `cross-area: ${part.title} -> ${expected}, got ${result.area}`);
  checks += 1;
}

const orderedA = { bore: 20, stroke: 50, nested: { pressure: 6, unit: 'bar' } };
const orderedB = { nested: { unit: 'bar', pressure: 6 }, stroke: 50, bore: 20 };
assert.equal(buildClassificationFingerprint({ title: 'Cylinder', specifications: orderedA }), buildClassificationFingerprint({ title: 'Cylinder', specifications: orderedB }), 'fingerprint must be key-order stable');
assert.notEqual(buildClassificationFingerprint({ title: 'Cylinder', specifications: { bore: 20 } }), buildClassificationFingerprint({ title: 'Cylinder', specifications: { bore: '20' } }), 'fingerprint must preserve types');
checks += 2;

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
