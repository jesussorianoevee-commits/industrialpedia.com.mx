import assert from 'node:assert/strict';
import { isNonIndustrialQuery, isLikelyIndustrialSource, looksLikePartNumber } from '../shared/searchRules.js';
import { sanitizeResultIdentity } from '../shared/identityGuard.js';
import { isTechnicalSpecification } from '../shared/semanticResolver.js';
import { sanitizeExtractedPair } from '../shared/extract.js';
import { expandCatalogResults } from '../shared/tavilySearch.js';

const tests = [
  ['balero', false], ['rodamiento', false], ['sensor', false], ['encoder', false],
  ['válvula', false], ['relevador', false], ['conector neumático', false],
  ['PLC', false], ['motor', false], ['bomba', false], ['fuente', false],
  ['driver', false], ['controlador', false], ['receta de cocina', true],
  ['película de terror', true], ['pizza', true], ['asdfgh', false]
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
assert.equal(isTechnicalSpecification('Stock', '00062920 in').ok, false);
assert.equal(isTechnicalSpecification('SKU', '00062920').ok, false);
assert.equal(isTechnicalSpecification('Quantity', '25').ok, false);
assert.equal(isTechnicalSpecification('Price', '$120').ok, false);

// Ficha técnica: assets/Markdown/URLs nunca pueden convertirse en specs.
assert.equal(sanitizeExtractedPair('![APC logo toggle]', '//www.se.com/us/en/assets/v2/739/media/202251/APC_logo_toggle.svg'), null);
assert.equal(sanitizeExtractedPair('![Image 1](https://example.com/product.png)', 'Product image'), null);
assert.equal(sanitizeExtractedPair('Search icon', '//example.com/media/icon.gif'), null);
assert.equal(sanitizeExtractedPair('javascript:void(0);', '5'), null);
assert.deepEqual(sanitizeExtractedPair('Stroke', '25 mm'), { attribute: 'Stroke', value: '25 mm' });
assert.deepEqual(sanitizeExtractedPair('Supply voltage', '24 V DC'), { attribute: 'Supply voltage', value: '24 V DC' });
assert.deepEqual(sanitizeExtractedPair('Contact force', '5 N'), { attribute: 'Contact force', value: '5 N' });

// Catálogo/familia: el documento solo aparece si demuestra una o más partes.
const catalogWithPart = expandCatalogResults([{
  title: 'Festo VUVS product catalog',
  url: 'https://www.festo.com/catalog/vuvs',
  source_type: 'official',
  manufacturer_name: 'Festo',
  snippet: 'Festo electrovalve catalog',
  raw_content: 'Festo electrovalve — Part number: VUVS-LK20-M32C-AD-G18-1C1\\n24 V DC'
}], 'electrovalvula festo');
assert.equal(catalogWithPart.length, 1);
assert.equal(catalogWithPart[0].part_number, 'VUVS-LK20-M32C-AD-G18-1C1');
assert.equal(catalogWithPart[0].catalog_source, true);

const catalogWithoutPart = expandCatalogResults([{
  title: 'Festo pneumatic product catalog',
  url: 'https://www.festo.com/catalog/pneumatic',
  source_type: 'official',
  manufacturer_name: 'Festo',
  snippet: 'Product overview and catalog',
  raw_content: 'Festo pneumatic product families and applications. No order numbers on this page.'
}], 'electrovalvula festo');
assert.equal(catalogWithoutPart.length, 0);

console.log('REGRESSION_GATE_OK');
