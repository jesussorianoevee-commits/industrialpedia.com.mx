// Portable deterministic classification evidence helpers.
// No Base44 SDK dependency: this module can move to GitHub/Vercel unchanged.
// RULES currently covers ONLY Neumática; do not interpret unclassified results as
// evidence that other Industrialpedia areas are absent.

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

const textOf = (part = {}) => [
  part.name,
  part.title,
  part.description,
  part.category,
  part.part_number,
  ...Object.entries(part.specifications || {}).flatMap(([key, value]) => [
    key,
    typeof value === 'object' && value !== null ? value.value : value
  ])
].map(normalize).filter(Boolean).join(' ');

const RULES = [
  {
    area: 'neumatica',
    // Generic words are weak evidence; specific industrial concepts are strong evidence.
    include: [
      { term: 'pneumatic', weight: 15 }, { term: 'pneumatics', weight: 15 },
      { term: 'neumatico', weight: 15 }, { term: 'neumatica', weight: 15 },
      { term: 'neumaticos', weight: 15 }, { term: 'neumaticas', weight: 15 },
      { term: 'compressed air', weight: 20 }, { term: 'air compressor', weight: 40 },
      { term: 'air preparation', weight: 40 }, { term: 'air cylinder', weight: 40 },
      { term: 'pneumatic cylinder', weight: 40 }, { term: 'pneumatic actuator', weight: 40 },
      { term: 'rotary actuator', weight: 30 }, { term: 'air actuator', weight: 40 },
      { term: 'air gripper', weight: 40 }, { term: 'solenoid valve', weight: 25 },
      { term: 'air valve', weight: 40 }, { term: 'quick exhaust valve', weight: 40 },
      { term: 'push in fitting', weight: 35 }, { term: 'push to connect', weight: 35 },
      { term: 'pneumatic fitting', weight: 40 }, { term: 'cilindro neumatico', weight: 40 },
      { term: 'valvula neumatica', weight: 40 }, { term: 'valvula solenoide', weight: 25 },
      { term: 'actuador neumatico', weight: 40 }, { term: 'actuador rotativo', weight: 30 },
      { term: 'unidad frl', weight: 40 }, { term: 'frl unit', weight: 40 },
      { term: 'filtro regulador lubricador', weight: 40 }, { term: 'frl', weight: 35 }
    ],
    exclude: [
      'laboratory condenser', 'vacuum pump', 'centrifugal pump', 'peristaltic pump',
      'liquid pump', 'hydro pneumatic accumulator', 'tire pressure gauge', 'manual tecnico',
      'technical manual', 'chapter'
    ],
    manufacturerHints: ['smc', 'nihon pisco', 'festo', 'parker', 'aventics', 'norgren', 'camozzi', 'metal work'],
    minScore: 35
  }
];

function phrasePositions(text, phrase) {
  const words = normalize(phrase).split(' ').filter(Boolean);
  const tokens = text.split(' ').filter(Boolean);
  const positions = [];
  for (let i = 0; i <= tokens.length - words.length; i += 1) {
    if (words.every((word, offset) => tokens[i + offset] === word)) positions.push(i);
  }
  return positions;
}

function isNegated(tokens, position) {
  // Keep scope local: negation may be adjacent or separated by up to two tokens
  // ("no es neumatico", "sin sistema neumatico").
  const window = tokens.slice(Math.max(0, position - 3), position);
  return window.some((token) => ['non', 'not', 'no', 'sin'].includes(token));
}

function termOccurrences(text, definitions) {
  const tokens = text.split(' ').filter(Boolean);
  return definitions.flatMap((definition) => phrasePositions(text, definition.term || definition).map((position) => ({
    term: definition.term || definition,
    weight: definition.weight ?? 0,
    position,
    negated: isNegated(tokens, position)
  })));
}

function uniqueEvidence(occurrences) {
  // A term can occur many times in a description; repeated mentions must not inflate score.
  const byTerm = new Map();
  for (const occurrence of occurrences.filter((item) => !item.negated)) {
    const current = byTerm.get(occurrence.term);
    if (!current || occurrence.weight > current.weight) byTerm.set(occurrence.term, occurrence);
  }
  return [...byTerm.values()];
}

export function buildClassificationFingerprint(part = {}) {
  // Normalize human-readable text, but preserve canonical JSON types in specifications.
  // This keeps 20 (number) distinct from "20" (string) while remaining key-order stable.
  const textPayload = [
    part.part_number,
    part.name || part.title,
    part.description,
    part.category,
    part.manufacturer || part.manufacturer_name
  ].map(normalize);
  const payload = [...textPayload, stableStringify(part.specifications ?? {})].join('|');
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

export function classifyWithEvidence(part = {}) {
  const text = textOf(part);
  const manufacturer = normalize(part.manufacturer || part.manufacturer_name);
  const candidates = RULES.map((rule) => {
    const includeOccurrences = termOccurrences(text, rule.include);
    const validEvidence = uniqueEvidence(includeOccurrences);
    const negatedHits = includeOccurrences.filter((item) => item.negated);
    const excludeOccurrences = termOccurrences(text, rule.exclude.map((term) => ({ term, weight: 80 })));
    const excludeHits = uniqueEvidence(excludeOccurrences);
    const manufacturerHits = rule.manufacturerHints.filter((hint) => phrasePositions(manufacturer, hint).length > 0);

    // Manufacturer corroborates strong product evidence; it can never create a classification.
    const productScore = validEvidence.reduce((sum, item) => sum + item.weight, 0);
    const manufacturerScore = productScore >= rule.minScore && manufacturerHits.length > 0 ? 5 : 0;
    const score = productScore + manufacturerScore - excludeHits.length * 80;
    const accepted = productScore >= rule.minScore && excludeHits.length === 0;

    return {
      area: rule.area,
      score,
      accepted,
      evidence: {
        include_terms: validEvidence.map((item) => item.term),
        negated_terms: negatedHits.map((item) => item.term),
        exclude_terms: excludeHits.map((item) => item.term),
        manufacturer_hints: manufacturerHits
      }
    };
  }).sort((a, b) => b.score - a.score);

  const winner = candidates.find((candidate) => candidate.accepted) || null;
  return {
    area: winner?.area || null,
    confidence: winner ? Math.min(1, winner.score / 100) : 0,
    fingerprint: buildClassificationFingerprint(part),
    candidates,
    rule_version: 'shadow-evidence-v3'
  };
}
