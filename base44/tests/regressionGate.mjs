import assert from 'node:assert/strict';
import { isNonIndustrialQuery, isLikelyIndustrialSource, looksLikePartNumber } from '../shared/searchRules.js';
import { sanitizeResultIdentity } from '../shared/identityGuard.js';
import { isTechnicalSpecification } from '../shared/semanticResolver.js';

const tests = [
  ['balero', false], ['rodamiento', false], ['sensor', false], ['encoder', false],
  ['válvula', false], ['relevador', false], ['conector neumático', false],
  ['PLC', false], ['motor', false], ['bomba', false], ['fuente', false],
  ['driver', false], ['controlador', false], ['receta de cocina', true],
  ['película de terror', true], ['pizza', false], ['asdfgh', false]
];
for (const [q, expected] of tests) assert.equal(isNonIndustrialQuery(q), expected, `query gate: ${q}`);

assert.equal(looksLikePartNumber('6ES7214-1AG40-0XB0'), true);
assert.equal(looksLikePartNumber('DSNU-25-25-PPV-A'), true);
assert.equal(looksLikePartNumber('balero 2/4'), false);
assert.equal(looksLikePartNumber('S24'), true);

assert.equal(isLikelyIndustrialSource('https://www.amazon.com/x', 'Industrial bearing', 'bearing'), false);
assert.equal(isLikelyIndustrialSource('https://www.imslp.org/x', 'Bolero', 'music'), false);
assert.equal(isLikelyIndustrialSource('https://www.festo.com/x', 'DSNU cylinder', 'pneumatic cylinder'), true);
assert.equal(isLikelyIndustrialSource('https://www.smcworld.com/x', 'Pneumatic fitting', 'industrial connector'), true);

const contaminated = sanitizeResultIdentity({ manufacturer_name: 'balero', part_number: 'VREF1', source_type: 'web_discovery' }, 'balero');
assert.equal(contaminated.manufacturer_name, '');
assert.equal(contaminated.part_number, '');

const officialManufacturer = sanitizeResultIdentity({ manufacturer_name: 'Festo', part_number: 'DSNU-25-25-PPV-A', source_type: 'official' }, 'Festo');
assert.equal(officialManufacturer.manufacturer_name, 'Festo');
assert.equal(officialManufacturer.part_number, 'DSNU-25-25-PPV-A');

assert.equal(isTechnicalSpecification('Stroke', '25 mm').ok, true);
assert.equal(isTechnicalSpecification('Supply voltage', '24 V DC').ok, true);
assert.equal(isTechnicalSpecification('Industry', 'Automation Machinery Manufacturing').ok, false);
assert.equal(isTechnicalSpecification('Headquarters', 'Paris').ok, false);
assert.equal(isTechnicalSpecification('Website', 'https://example.com').ok, false);

console.log('REGRESSION_GATE_OK');
