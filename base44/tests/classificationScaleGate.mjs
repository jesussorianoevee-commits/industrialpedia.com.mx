import assert from 'node:assert/strict';
import { createClassificationRuntime, selectChangedParts } from '../shared/classificationRuntime.js';
import { buildClassificationFingerprint } from '../shared/classificationEvidence.js';

const runtime = createClassificationRuntime({ ruleVersion: 'shadow-evidence-v3' });
const unique = [
  { id: 'n1', title: 'Festo DSNU pneumatic cylinder' },
  { id: 's1', title: 'Inductive proximity sensor M12' },
  { id: 'e1', title: '24V DC power supply' },
  { id: 'i1', title: 'Digital pressure gauge' },
  { id: 'l1', title: 'Micropipette Nichipet' },
  { id: 'f1', title: 'Peristaltic pump 2 L/min' },
  { id: 'm1', title: 'Deep groove ball bearing' }
];

// Simulate a large catalogue with repeated ingestion of unchanged canonical records.
const million = Array.from({ length: 100000 }, (_, index) => ({ ...unique[index % unique.length], row: index }));
const first = runtime.classifyBatch(million, { batchSize: 1000 });
const second = runtime.classifyBatch(million, { batchSize: 1000 });
assert.equal(first.metrics.processed, 100000);
assert.equal(second.metrics.processed, 100000);
assert.ok(second.metrics.cache_hits > 99900, `expected near-total cache reuse, got ${second.metrics.cache_hits}`);
assert.equal(first.metrics.classified, 100000);
assert.equal(second.metrics.classified, 100000);

const previous = new Map(unique.map((part) => [part.id, {
  fingerprint: buildClassificationFingerprint(part),
  rule_version: 'shadow-evidence-v3'
}]));
const next = unique.map((part) => part.id === 's1'
  ? { ...part, title: 'Inductive proximity sensor M18' }
  : part
).concat([{ id: 'new1', title: 'K thermocouple probe' }]);
const delta = selectChangedParts(next, previous);
assert.equal(delta.changed.length, 2);
assert.equal(delta.unchanged.length, unique.length - 1);

console.log(JSON.stringify({
  status: 'CLASSIFICATION_SCALE_GATE_OK',
  processed: second.metrics.processed,
  cache_hits_second_pass: second.metrics.cache_hits,
  cache_size: second.metrics.cache_size,
  delta_changed: delta.changed.length,
  delta_unchanged: delta.unchanged.length
}, null, 2));
