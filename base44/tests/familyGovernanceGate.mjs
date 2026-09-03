import assert from 'node:assert/strict';
import { evaluateCrossReference, STATES } from '../shared/crossReferenceEngine.js';

const base = { part_number: 'BASE-1', family_code: 'mixed_family', specifications: { size: '10' } };
const candidate = { part_number: 'CAND-1', family_code: 'mixed_family', specifications: { size: '10' }, evidence: [{ type: 'datasheet', verified: true }] };

// A database-marked mixed family is hard-blocked from automatic equivalence.
const blocked = evaluateCrossReference(base, candidate, [{ family_code: 'mixed_family', property_code: 'size', requirement_level: 'critical', comparison_operator: 'equal', active: true }], { status: 'BLOCKED_MIXED_FAMILY', reason: 'CATEGORY_MIXES_MULTIPLE_TECHNICAL_PRODUCT_TYPES' });
assert.equal(blocked.state, STATES.SIMILAR_REVIEW);
assert.equal(blocked.family_readiness, 'BLOCKED_MIXED_FAMILY');

// A family with only supporting rules is never eligible for automatic equivalence.
const supportingOnly = [{
  family_code: 'mixed_family', property_code: 'size', requirement_level: 'supporting', comparison_operator: 'equal', active: true
}];
const supportingResult = evaluateCrossReference(base, candidate, supportingOnly);
assert.notEqual(supportingResult.state, STATES.EQUIVALENT);
assert.equal(supportingResult.state, STATES.SIMILAR_REVIEW);

// No rules at all is also review-only, even with complete-looking product data.
const noRules = evaluateCrossReference(base, candidate, []);
assert.notEqual(noRules.state, STATES.EQUIVALENT);
assert.equal(noRules.state, STATES.SIMILAR_REVIEW);

// A governed family needs at least one critical rule before equivalence is possible.
const governed = [
  { family_code: 'governed_family', property_code: 'size', requirement_level: 'critical', comparison_operator: 'equal', active: true },
  { family_code: 'governed_family', property_code: 'type', requirement_level: 'required', comparison_operator: 'equal', active: true }
];
const governedBase = { ...base, family_code: 'governed_family', specifications: { size: '10', type: 'A' } };
const governedCandidate = { ...candidate, family_code: 'governed_family', specifications: { size: '10', type: 'A' } };
const governedResult = evaluateCrossReference(governedBase, governedCandidate, governed);
assert.equal(governedResult.state, STATES.EQUIVALENT);

// Critical mismatch must remain a hard exclusion regardless of score.
const criticalMismatch = { ...governedCandidate, specifications: { size: '11', type: 'A' } };
const mismatchResult = evaluateCrossReference(governedBase, criticalMismatch, governed);
assert.equal(mismatchResult.state, STATES.NOT_SUBSTITUTABLE);
assert.equal(mismatchResult.critical_fail, 1);

console.log(JSON.stringify({
  status: 'FAMILY_GOVERNANCE_GATE_OK',
  checks: 6,
  policy: 'no governed family rules => no automatic equivalence'
}, null, 2));
