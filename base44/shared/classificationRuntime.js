// Portable runtime helpers for large deterministic classification workloads.
// No Base44 dependency. Safe to move unchanged to workers/queues in GitHub/Vercel.

import { classifyWithEvidence, buildClassificationFingerprint } from './classificationEvidence.js';

export function createClassificationRuntime(options = {}) {
  const classifier = options.classifier || classifyWithEvidence;
  const fingerprint = options.fingerprint || buildClassificationFingerprint;
  const cache = options.cache || new Map();
  const ruleVersion = options.ruleVersion || 'shadow-evidence-v3';

  function classify(part = {}) {
    const key = `${ruleVersion}:${fingerprint(part)}`;
    const cached = cache.get(key);
    if (cached) return { ...cached, cache_hit: true };
    const result = classifier(part);
    const stored = { ...result, cache_hit: false };
    cache.set(key, stored);
    return stored;
  }

  function classifyBatch(parts = [], options = {}) {
    const batchSize = Math.max(1, options.batchSize || 500);
    const results = [];
    let cacheHits = 0;
    for (let start = 0; start < parts.length; start += batchSize) {
      const batch = parts.slice(start, start + batchSize);
      for (const part of batch) {
        const result = classify(part);
        if (result.cache_hit) cacheHits += 1;
        results.push(result);
      }
    }
    return {
      results,
      metrics: {
        processed: parts.length,
        cache_hits: cacheHits,
        classified: results.filter((item) => item.area).length,
        shadow_review: results.filter((item) => item.status === 'shadow_review').length,
        batches: Math.ceil(parts.length / batchSize),
        cache_size: cache.size
      }
    };
  }

  function invalidateRuleVersion(nextRuleVersion) {
    if (!nextRuleVersion || nextRuleVersion === ruleVersion) return;
    cache.clear();
  }

  return { classify, classifyBatch, invalidateRuleVersion, cache };
}

export function selectChangedParts(parts = [], previous = new Map(), options = {}) {
  const fingerprint = options.fingerprint || buildClassificationFingerprint;
  const ruleVersion = options.ruleVersion || 'shadow-evidence-v3';
  const changed = [];
  const unchanged = [];

  for (const part of parts) {
    const id = part.id ?? part.part_number ?? fingerprint(part);
    const nextFingerprint = fingerprint(part);
    const prior = previous.get(id);
    const same = prior
      && prior.fingerprint === nextFingerprint
      && prior.rule_version === ruleVersion;
    (same ? unchanged : changed).push(part);
  }

  return { changed, unchanged };
}
