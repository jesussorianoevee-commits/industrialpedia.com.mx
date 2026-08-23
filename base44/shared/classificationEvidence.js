// Portable deterministic classification evidence helpers.
// No Base44 SDK dependency: this module can move to GitHub/Vercel unchanged.
// RULES currently covers ONLY Neumática; do not interpret unclassified results as
// evidence that other Industrialpedia areas are absent.

const normalize = (value) => String(value || '')
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
    include: [
      'pneumatic', 'pneumatics', 'neumatico', 'neumatica', 'neumaticos', 'neumaticas',
      'compressed air', 'air compressor', 'air preparation', 'air cylinder', 'pneumatic cylinder',
      'pneumatic actuator', 'rotary actuator', 'air actuator', 'air gripper',
      'solenoid valve', 'air valve', 'quick exhaust valve',
      'push in fitting', 'push to connect', 'pneumatic fitting',
      'cilindro neumatico', 'valvula neumatica', 'valvula solenoide',
      'actuador neumatico', 'actuador rotativo', 'unidad frl', 'frl unit', 'filtro regulador lubricador'
    ],
    exclude: ['laboratory condenser', 'vacuum pump', 'centrifugal pump', 'peristaltic pump', 'liquid pump'],
    manufacturerHints: ['smc', 'nihon pisco', 'festo', 'parker', 'aventics', 'norgren', 'camozzi', 'metal work'],
    minScore: 25
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
  const previous = tokens[position - 1] || '';
  return ['non', 'not', 'no', 'sin'].includes(previous);
}

function hits(text, terms) {
  const tokens = text.split(' ').filter(Boolean);
  return terms.filter((term) => phrasePositions(text, term).some((position) => !isNegated(tokens, position)));
}

function negatedTerms(text, terms) {
  const tokens = text.split(' ').filter(Boolean);
  return terms.filter((term) => phrasePositions(text, term).some((position) => isNegated(tokens, position)));
}

export function buildClassificationFingerprint(part = {}) {
  const payload = [
    part.part_number,
    part.name || part.title,
    part.description,
    part.category,
    part.manufacturer || part.manufacturer_name,
    stableStringify(part.specifications || {})
  ].map(normalize).join('|');
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
    const includeHits = hits(text, rule.include);
    const negatedHits = negatedTerms(text, rule.include);
    const excludeHits = hits(text, rule.exclude);
    const manufacturerHits = rule.manufacturerHints.filter((hint) => phrasePositions(manufacturer, hint).length > 0);

    // Product evidence is required. Manufacturer identity only corroborates an existing match.
    const score = includeHits.length * 25 + (includeHits.length > 0 ? manufacturerHits.length * 10 : 0) - excludeHits.length * 80;
    const accepted = includeHits.length > 0 && negatedHits.length === 0 && excludeHits.length === 0 && score >= rule.minScore;

    return {
      area: rule.area,
      score,
      accepted,
      evidence: {
        include_terms: includeHits,
        negated_terms: negatedHits,
        exclude_terms: excludeHits,
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
    rule_version: 'shadow-evidence-v2'
  };
}
