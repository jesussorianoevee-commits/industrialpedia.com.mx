// Portable deterministic classification evidence helpers.
// No Base44 SDK dependency: this module can move to GitHub/Vercel unchanged.

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const textOf = (part = {}) => [
  part.name,
  part.title,
  part.description,
  part.category,
  part.manufacturer,
  part.manufacturer_name,
  part.part_number,
  ...Object.entries(part.specifications || {}).flatMap(([key, value]) => [
    key,
    typeof value === 'object' && value !== null ? value.value : value
  ])
].map(normalize).filter(Boolean).join(' ');

const RULES = [
  {
    area: 'neumatica',
    include: ['pneumatic', 'neumatic', 'compressed air', 'air preparation', 'air cylinder', 'pneumatic cylinder', 'solenoid valve', 'air valve', 'push in fitting', 'push to connect', 'pneumatic fitting', 'air gripper'],
    exclude: ['laboratory condenser', 'vacuum pump', 'centrifugal pump', 'peristaltic pump', 'liquid pump'],
    manufacturerHints: ['smc', 'nihon pisco'], 
    minScore: 45
  }
];

function hits(text, terms) {
  const padded = ` ${text} `;
  return terms.filter((term) => {
    const normalized = normalize(term);
    return padded.includes(` ${normalized} `);
  });
}

export function buildClassificationFingerprint(part = {}) {
  const payload = [
    part.part_number,
    part.name || part.title,
    part.description,
    part.category,
    part.manufacturer || part.manufacturer_name,
    JSON.stringify(part.specifications || {})
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
    const excludeHits = hits(text, rule.exclude);
    const manufacturerHits = rule.manufacturerHints.filter((hint) => {
      const normalized = normalize(hint);
      const paddedManufacturer = ` ${manufacturer} `;
      if (normalized.includes(' ')) return paddedManufacturer.includes(` ${normalized} `);
      return manufacturer.split(' ').includes(normalized);
    });
    const score = includeHits.length * 25 + manufacturerHits.length * 10 - excludeHits.length * 80;
    return {
      area: rule.area,
      score,
      accepted: excludeHits.length === 0 && score >= rule.minScore,
      evidence: {
        include_terms: includeHits,
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
    rule_version: 'shadow-evidence-v1'
  };
}
