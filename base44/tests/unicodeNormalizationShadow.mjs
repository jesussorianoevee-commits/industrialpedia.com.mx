import assert from 'node:assert/strict';
import { normalizePartNumber as legacyNormalize } from '../shared/normalize.js';
import { looksLikePartNumber as legacyLooksLike } from '../shared/searchRules.js';
import { normalizeIdentifierUnicode, isUnicodeTechnicalIdentifier, unicodeSignature } from '../shared/unicodeIdentifier.js';

const CASES = [
  'LTC-450α',
  'β-120',
  'VIO-50Bα'
];

const report = CASES.map((raw) => ({
  raw,
  legacy_normalized: legacyNormalize(raw),
  unicode_normalized: normalizeIdentifierUnicode(raw),
  legacy_detected: legacyLooksLike(raw),
  unicode_detected: isUnicodeTechnicalIdentifier(raw),
  unicode_signature: unicodeSignature(raw)
}));

for (const row of report) {
  assert.ok(/[Α-Ωα-ω]/u.test(row.unicode_normalized) || /[Α-Ω]/u.test(row.unicode_normalized), `Unicode must survive normalization: ${row.raw}`);
  assert.equal(row.unicode_detected, true, `Unicode-safe detector must accept: ${row.raw}`);
}

// ASCII compatibility must remain unchanged in the proposed replacement.
const ASCII = ['6ES7214-1AG40-0XB0', 'DSNU-25-25-PPV-A', 'MT-05K'];
for (const raw of ASCII) {
  assert.equal(normalizeIdentifierUnicode(raw), legacyNormalize(raw), `ASCII compatibility: ${raw}`);
}

// Regression proof: current detector rejects the confirmed Unicode identifiers,
// while the shadow implementation accepts them. This is expected until cutover.
for (const raw of CASES) {
  assert.equal(legacyLooksLike(raw), false, `Legacy ASCII gate should expose current regression: ${raw}`);
}

console.log(JSON.stringify({
  status: 'UNICODE_NORMALIZATION_SHADOW_OK',
  mode: 'shadow_only_no_production_cutover',
  cases: report
}, null, 2));
