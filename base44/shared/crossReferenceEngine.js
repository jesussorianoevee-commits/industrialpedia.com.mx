/*
 * Cross-Reference Engine v1
 * Deterministic only. No AI, embeddings or probabilistic inference.
 *
 * This module is deliberately pure: retrieval, persistence and UI remain outside.
 * It consumes canonical/normalized specifications and family rules and returns an
 * auditable decision with the exact reasons for every exclusion or acceptance.
 */

const STATES = Object.freeze({
  EXACT: 'EXACT',
  REPLACE: 'REPLACE',
  EQUIVALENT: 'EQUIVALENT',
  COMPATIBLE: 'COMPATIBLE',
  SIMILAR_REVIEW: 'SIMILAR_REVIEW',
  NOT_SUBSTITUTABLE: 'NOT_SUBSTITUTABLE',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE'
});

const RELATION_STRENGTH = Object.freeze({
  official_replacement: 100,
  successor: 95,
  equivalent: 90,
  compatible: 70,
  similar: 40
});

function canonicalKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function valuesEqual(a, b) {
  return canonicalKey(a) === canonicalKey(b);
}

function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function evaluateRule(baseValue, candidateValue, rule) {
  if (baseValue == null || candidateValue == null || baseValue === '' || candidateValue === '') {
    return { state: 'missing', pass: false, comparable: false };
  }

  if (rule.comparison_operator === 'equal') {
    const pass = valuesEqual(baseValue, candidateValue);
    return { state: pass ? 'equal' : 'different', pass, comparable: true };
  }

  const a = numeric(baseValue);
  const b = numeric(candidateValue);
  if (a == null || b == null) return { state: 'not_comparable', pass: false, comparable: false };

  const tolerance = Number(rule.tolerance_pct ?? 0);
  const allowed = Math.abs(a) * tolerance / 100;
  let pass;
  switch (rule.comparison_operator) {
    case 'gte': pass = b >= a; break;
    case 'lte': pass = b <= a; break;
    case 'within_tolerance': pass = Math.abs(b - a) <= allowed; break;
    default: return { state: 'not_comparable', pass: false, comparable: false };
  }
  return { state: pass ? 'equal' : 'different', pass, comparable: true };
}

function evidenceAllowsRelation(candidate, relation) {
  if (relation === 'official_replacement' || relation === 'successor') {
    return Array.isArray(candidate.evidence) && candidate.evidence.some((e) =>
      e && (e.type === relation || e.relation === relation || e.verified === true)
    );
  }
  return true;
}

/**
 * Compare one candidate against a base part.
 * `rules` are data, not code: [{property_code, requirement_level, comparison_operator, tolerance_pct}].
 */
export function evaluateCrossReference(base, candidate, rules = []) {
  if (!base || !candidate) throw new TypeError('base and candidate are required');

  const baseFamily = canonicalKey(base.family_code || base.category);
  const candidateFamily = canonicalKey(candidate.family_code || candidate.category);
  if (!baseFamily || !candidateFamily || baseFamily !== candidateFamily) {
    return {
      state: STATES.NOT_SUBSTITUTABLE,
      relation: null,
      family_match: false,
      score: 0,
      compared: 0,
      equal: 0,
      different: 0,
      missing: 0,
      not_comparable: 0,
      critical_fail: 1,
      critical_total: 1,
      required_fail: 0,
      required_total: 0,
      reasons: ['FAMILY_MISMATCH']
    };
  }

  if (canonicalKey(base.part_number) && canonicalKey(base.part_number) === canonicalKey(candidate.part_number)) {
    return {
      state: STATES.EXACT,
      relation: 'exact_identity',
      family_match: true,
      score: 100,
      compared: 0,
      equal: 0,
      different: 0,
      missing: 0,
      not_comparable: 0,
      critical_fail: 0,
      critical_total: 0,
      required_fail: 0,
      required_total: 0,
      reasons: ['EXACT_PART_NUMBER']
    };
  }

  const specsA = base.specifications || {};
  const specsB = candidate.specifications || {};
  const applicableRules = rules.filter((r) => r && canonicalKey(r.family_code || baseFamily) === baseFamily && r.active !== false);

  let compared = 0, equal = 0, different = 0, missing = 0, notComparable = 0;
  let criticalFail = 0, criticalTotal = 0, requiredFail = 0, requiredTotal = 0;
  const reasons = [];

  for (const rule of applicableRules) {
    const property = rule.property_code;
    const result = evaluateRule(specsA[property], specsB[property], rule);
    if (result.comparable) compared += 1;
    if (result.state === 'equal') equal += 1;
    else if (result.state === 'different') different += 1;
    else if (result.state === 'missing') missing += 1;
    else notComparable += 1;

    const level = canonicalKey(rule.requirement_level || 'supporting');
    if (level === 'critical') {
      criticalTotal += 1;
      if (!result.pass) {
        criticalFail += 1;
        reasons.push(`CRITICAL_${result.state.toUpperCase()}:${property}`);
      }
    } else if (level === 'required') {
      requiredTotal += 1;
      if (!result.pass) {
        requiredFail += 1;
        reasons.push(`REQUIRED_${result.state.toUpperCase()}:${property}`);
      }
    }
  }

  const ruleCount = applicableRules.length;
  const score = ruleCount ? Math.round((equal / ruleCount) * 100) : 0;
  const hasEvidence = Array.isArray(candidate.evidence) && candidate.evidence.length > 0;
  const governedRules = applicableRules.filter((r) => ['critical', 'required'].includes(canonicalKey(r.requirement_level)));
  const familyReadiness = governedRules.length === 0 ? 'REVIEW_ONLY_NO_GOVERNED_RULES' : criticalTotal === 0 ? 'REVIEW_ONLY_NO_CRITICAL_RULES' : 'READY';

  if (criticalFail > 0) {
    return { state: STATES.NOT_SUBSTITUTABLE, relation: null, family_match: true, score, compared, equal, different, missing, not_comparable: notComparable, critical_fail: criticalFail, critical_total: criticalTotal, required_fail: requiredFail, required_total: requiredTotal, reasons };
  }
  if (requiredFail > 0) {
    return { state: STATES.INSUFFICIENT_EVIDENCE, relation: null, family_match: true, score, compared, equal, different, missing, not_comparable: notComparable, critical_fail: 0, critical_total: criticalTotal, required_fail: requiredFail, required_total: requiredTotal, reasons };
  }
  if (!ruleCount || missing > 0 || notComparable > 0 || familyReadiness !== 'READY') {
    return { state: hasEvidence ? STATES.SIMILAR_REVIEW : STATES.INSUFFICIENT_EVIDENCE, relation: 'similar', family_match: true, score, compared, equal, different, missing, not_comparable: notComparable, critical_fail: 0, critical_total: criticalTotal, required_fail: 0, required_total: requiredTotal, reasons: reasons.concat(missing ? ['MISSING_REQUIRED_COMPARISON_DATA'] : [], notComparable ? ['NON_COMPARABLE_DATA'] : []) };
  }

  return { state: STATES.EQUIVALENT, relation: 'equivalent', family_match: true, score, compared, equal, different, missing, not_comparable: notComparable, critical_fail: 0, critical_total: criticalTotal, required_fail: 0, required_total: requiredTotal, reasons: ['ALL_ACTIVE_RULES_PASS'] };
}

/**
 * Applies explicit, documented relations before technical equivalence.
 * This prevents an official replacement from being downgraded to a generic similarity score.
 */
export function resolveCrossReference(base, candidate, rules = []) {
  const technical = evaluateCrossReference(base, candidate, rules);
  const relations = Array.isArray(candidate.relations) ? candidate.relations : [];

  for (const relation of ['official_replacement', 'successor', 'compatible']) {
    const declared = relations.some((r) => r && r.type === relation && valuesEqual(r.from_part_number || base.part_number, base.part_number));
    if (declared && evidenceAllowsRelation(candidate, relation)) {
      return {
        ...technical,
        state: relation === 'official_replacement' || relation === 'successor' ? STATES.REPLACE : STATES.COMPATIBLE,
        relation,
        score: Math.max(technical.score, RELATION_STRENGTH[relation]),
        reasons: technical.reasons.concat(`DECLARED_${relation.toUpperCase()}`)
      };
    }
  }
  return technical;
}

export { STATES, RELATION_STRENGTH };
