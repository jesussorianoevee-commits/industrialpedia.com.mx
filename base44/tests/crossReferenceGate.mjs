import assert from 'node:assert/strict';
import { evaluateCrossReference, resolveCrossReference, STATES } from '../shared/crossReferenceEngine.js';

const rules = [
  { family_code: 'sensor_proximity', property_code: 'sensing_distance_mm', requirement_level: 'critical', comparison_operator: 'within_tolerance', tolerance_pct: 10, active: true },
  { family_code: 'sensor_proximity', property_code: 'supply_voltage', requirement_level: 'critical', comparison_operator: 'equal', active: true },
  { family_code: 'sensor_proximity', property_code: 'output_type', requirement_level: 'required', comparison_operator: 'equal', active: true },
  { family_code: 'sensor_proximity', property_code: 'housing_diameter_mm', requirement_level: 'supporting', comparison_operator: 'within_tolerance', tolerance_pct: 5, active: true }
];

const base = {
  part_number: 'A-100',
  family_code: 'sensor_proximity',
  specifications: { sensing_distance_mm: '5 mm', supply_voltage: '24 VDC', output_type: 'PNP', housing_diameter_mm: '12 mm' }
};

const equivalent = {
  part_number: 'B-200',
  family_code: 'sensor_proximity',
  specifications: { sensing_distance_mm: '5.2 mm', supply_voltage: '24 VDC', output_type: 'PNP', housing_diameter_mm: '12.1 mm' },
  evidence: [{ type: 'datasheet', verified: true }]
};
const eq = evaluateCrossReference(base, equivalent, rules);
assert.equal(eq.state, STATES.EQUIVALENT);
assert.equal(eq.critical_fail, 0);
assert.equal(eq.different, 0);

const rangeRules = [{ family_code: 'sensor_proximity', property_code: 'supply_voltage', requirement_level: 'critical', comparison_operator: 'range_overlap', active: true }];
const rangePass = evaluateCrossReference({ ...base, specifications: { supply_voltage: { min: 10, max: 30 } } }, { ...equivalent, specifications: { supply_voltage: { min: 10, max: 36 } } }, rangeRules);
assert.equal(rangePass.state, STATES.EQUIVALENT);
const rangeFail = evaluateCrossReference({ ...base, specifications: { supply_voltage: { min: 10, max: 30 } } }, { ...equivalent, specifications: { supply_voltage: { min: 31, max: 36 } } }, rangeRules);
assert.equal(rangeFail.state, STATES.NOT_SUBSTITUTABLE);

const criticalFail = { ...equivalent, part_number: 'C-300', specifications: { ...equivalent.specifications, supply_voltage: '12 VDC' } };
const fail = evaluateCrossReference(base, criticalFail, rules);
assert.equal(fail.state, STATES.NOT_SUBSTITUTABLE);
assert.equal(fail.critical_fail, 1);
assert.ok(fail.reasons.some((r) => r.includes('supply_voltage')));

const missing = { ...equivalent, part_number: 'D-400', specifications: { ...equivalent.specifications } };
delete missing.specifications.output_type;
const miss = evaluateCrossReference(base, missing, rules);
assert.equal(miss.state, STATES.INSUFFICIENT_EVIDENCE);
assert.equal(miss.required_fail, 1);

const wrongFamily = { ...equivalent, part_number: 'E-500', family_code: 'photoelectric_sensor' };
const wrong = evaluateCrossReference(base, wrongFamily, rules);
assert.equal(wrong.state, STATES.NOT_SUBSTITUTABLE);
assert.equal(wrong.family_match, false);

const exact = evaluateCrossReference(base, { ...base }, rules);
assert.equal(exact.state, STATES.EXACT);
assert.equal(exact.relation, 'exact_identity');

const official = {
  ...equivalent,
  part_number: 'F-600',
  relations: [{ type: 'official_replacement', from_part_number: 'A-100' }],
  evidence: [{ type: 'official_replacement', relation: 'official_replacement', verified: true }]
};
const officialResult = resolveCrossReference(base, official, rules);
assert.equal(officialResult.state, STATES.REPLACE);
assert.equal(officialResult.relation, 'official_replacement');

// Generic verified evidence must never promote an undeclared official relation.
const genericVerified = {
  ...equivalent,
  part_number: 'G-700',
  relations: [{ type: 'official_replacement', from_part_number: 'A-100' }],
  evidence: [{ type: 'datasheet', verified: true }]
};
const genericResult = resolveCrossReference(base, genericVerified, rules);
assert.notEqual(genericResult.state, STATES.REPLACE);
assert.notEqual(genericResult.relation, 'official_replacement');

// Determinism: identical inputs produce byte-stable JSON output.
assert.equal(JSON.stringify(resolveCrossReference(base, equivalent, rules)), JSON.stringify(resolveCrossReference(base, equivalent, rules)));

console.log(JSON.stringify({ status: 'CROSS_REFERENCE_GATE_OK', checks: 12, policy: 'critical rules override similarity score' }, null, 2));
