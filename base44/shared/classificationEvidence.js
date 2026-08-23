// Portable deterministic classification evidence helpers.
// No Base44 SDK dependency: this module can move to GitHub/Vercel unchanged.
// Classification is deterministic and portable. Rules must distinguish strong product
// concepts from weak lexical mentions. Unclassified means insufficient evidence, never
// absence of a product family.

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
      // Compressed-air generation and treatment are part of the pneumatic system boundary.
      { term: 'compressed air', weight: 20 }, { term: 'air compressor', weight: 40 },
      { term: 'oil free compressor', weight: 35 }, { term: 'small compressor', weight: 40 },
      { term: 'industrial compressor', weight: 40 }, { term: 'piston compressor', weight: 40 },
      { term: 'compressor', weight: 30 },
      { term: 'compresor', weight: 30 }, { term: 'air dryer', weight: 40 },
      { term: 'frozen air dryer', weight: 40 }, { term: 'compressed air dryer', weight: 40 },
      { term: 'refrigerated air dryer', weight: 40 }, { term: 'desiccant air dryer', weight: 40 },
      { term: 'secador de aire', weight: 40 }, { term: 'secador de aire comprimido', weight: 40 },
      { term: 'air preparation', weight: 40 }, { term: 'air treatment', weight: 35 },
      { term: 'air receiver', weight: 35 }, { term: 'air tank', weight: 35 },
      { term: 'tube fitting', weight: 30 }, { term: 'pneumatic air supply', weight: 40 },
      { term: 'air cylinder', weight: 40 },
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
      'liquid pump', 'hydro pneumatic accumulator', 'pneumatic tire pressure gauge',
      'tire pressure gauge'
    ],
    // Manufacturer is corroborating evidence only. It can help a medium-strength,
    // domain-specific product signal cross the threshold, but can never classify alone.
    manufacturerHints: ['smc', 'nihon pisco', 'festo', 'parker', 'aventics', 'norgren', 'camozzi', 'metal work', 'jun air', 'kyowa industry'],
    minScore: 35,
    manufacturerCorroborationMinProductScore: 30,
    manufacturerCorroborationBonus: 5
  },
  {
    area: 'sensores',
    include: [
      { term: 'proximity sensor', weight: 45 }, { term: 'inductive sensor', weight: 45 },
      { term: 'photoelectric sensor', weight: 45 }, { term: 'optical sensor', weight: 45 }, { term: 'temperature sensor', weight: 40 },
      { term: 'probe sensor', weight: 40 }, { term: 'sensor de proximidad', weight: 45 },
      { term: 'sensor inductivo', weight: 45 }, { term: 'sensor fotoelectrico', weight: 45 }, { term: 'sensor optico', weight: 45 },
      { term: 'sensor de temperatura', weight: 40 }, { term: 'ph sensor', weight: 40 },
      { term: 'thermocouple', weight: 45 }, { term: 'termopar', weight: 45 },
      { term: 'k thermocouple', weight: 50 }, { term: 'thermocouple element', weight: 45 },
      { term: 'coated thermocouple', weight: 45 }, { term: 'sheath thermocouple', weight: 45 },
      { term: 'temperature probe', weight: 40 }, { term: 'sonda de temperatura', weight: 40 },
      { term: 'handle probe sensor', weight: 45 }, { term: 'sensing range', weight: 20 },
      { term: 'switching frequency', weight: 20 }, { term: 'sensor', weight: 15 }
    ],
    exclude: ['pressure gauge', 'tire pressure gauge'],
    manufacturerHints: ['balluff', 'ifm', 'keyence', 'omron', 'sick', 'turck'],
    minScore: 35,
    manufacturerCorroborationMinProductScore: 30,
    manufacturerCorroborationBonus: 5
  },
  {
    area: 'robotica',
    include: [
      { term: 'servo motor', weight: 45 }, { term: 'servo drive', weight: 45 },
      { term: 'robot controller', weight: 45 }, { term: 'industrial robot', weight: 50 },
      { term: 'robotic arm', weight: 50 }, { term: 'encoder interface', weight: 20 },
      { term: 'servo motion control', weight: 35 }
    ],
    exclude: [],
    manufacturerHints: ['siemens', 'fanuc', 'abb', 'kuka', 'yaskawa', 'staubli'],
    minScore: 35,
    manufacturerCorroborationMinProductScore: 30,
    manufacturerCorroborationBonus: 5
  },
  {
    area: 'electronica-control',
    include: [
      { term: 'power supply', weight: 40 }, { term: 'dc power supply', weight: 45 },
      { term: 'stabilized dc power supply', weight: 50 }, { term: 'fieldbus node', weight: 45 },
      { term: 'ac adapter', weight: 35 }, { term: 'ac adapters', weight: 35 }, { term: 'dc inverter welder', weight: 45 },
      { term: 'plc', weight: 40 },
      { term: 'programmable logic controller', weight: 50 },
      { term: 'profinet', weight: 30 }, { term: 'simatic et 200', weight: 45 },
      { term: 'fuente de alimentacion', weight: 45 }, { term: 'controlador programable', weight: 50 }
    ],
    exclude: ['fume hood fan unit', 'pcb cutter'],
    manufacturerHints: ['siemens', 'omron', 'schneider electric', 'allen bradley', 'mitsubishi electric'],
    minScore: 35,
    manufacturerCorroborationMinProductScore: 30,
    manufacturerCorroborationBonus: 5
  },
  {
    area: 'instrumentacion-medicion',
    include: [
      { term: 'pressure gauge', weight: 45 }, { term: 'ph meter', weight: 45 },
      { term: 'wind velocity meter', weight: 45 }, { term: 'wind flow meter', weight: 45 },
      { term: 'measurement range', weight: 20 }, { term: 'measuring range', weight: 20 },
      { term: 'straight scale', weight: 40 }, { term: 'automatic scale', weight: 40 },
      { term: 'thermometer', weight: 40 }, { term: 'data logger', weight: 40 }, { term: 'vibration meter', weight: 45 },
      { term: 'anemometer', weight: 45 }, { term: 'microscope', weight: 45 }, { term: 'loupe', weight: 35 }, { term: 'magnification', weight: 20 },
      { term: 'manometro', weight: 45 }, { term: 'medidor de presion', weight: 45 }
    ],
    exclude: [],
    manufacturerHints: ['testo', 'fluke', 'mitutoyo', 'shinwa'],
    minScore: 35,
    manufacturerCorroborationMinProductScore: 30,
    manufacturerCorroborationBonus: 5
  },
  {
    area: 'laboratorio-cientifico',
    include: [
      { term: 'silicone tube', weight: 40 }, { term: 'silicone blade hose', weight: 40 },
      { term: 'sample cup', weight: 40 }, { term: 'laboratory tube', weight: 45 },
      { term: 'stirring shaft', weight: 45 }, { term: 'ptfe stirring shaft', weight: 50 },
      { term: 'laboratory condenser', weight: 50 }, { term: 'heat resistance range', weight: 20 },
      { term: 'pharmed', weight: 30 }, { term: 'micropipette', weight: 50 },
      { term: 'micro pipette', weight: 50 }, { term: 'pipette tip', weight: 45 },
      { term: 'tip for micro pipette', weight: 50 }, { term: 'tube holder', weight: 40 },
      { term: 'bottle top dispenser', weight: 50 }, { term: 'neoprene plug', weight: 40 },
      { term: 'neoprene long plug', weight: 45 }, { term: 'long plug', weight: 30 }
    ],
    exclude: [],
    manufacturerHints: ['as one'],
    minScore: 35,
    manufacturerCorroborationMinProductScore: 30,
    manufacturerCorroborationBonus: 5
  },
  {
    area: 'fluidos-bombeo',
    include: [
      { term: 'pressure pump', weight: 45 }, { term: 'centrifugal pump', weight: 45 },
      { term: 'peristaltic pump', weight: 45 }, { term: 'perista pump', weight: 45 },
      { term: 'acid proof pump', weight: 45 }, { term: 'siphon pump', weight: 40 },
      { term: 'tubing pump', weight: 45 }, { term: 'tube pump', weight: 40 }, { term: 'pump tube', weight: 35 },
      { term: 'pump', weight: 15 }, { term: 'maximum flow rate', weight: 20 }, { term: 'discharge pressure', weight: 20 },
      { term: 'bomba de presion', weight: 45 }, { term: 'bomba peristaltica', weight: 45 }
    ],
    exclude: ['vacuum pump'],
    manufacturerHints: ['jabsco', 'grundfos', 'ebara'],
    minScore: 35,
    manufacturerCorroborationMinProductScore: 30,
    manufacturerCorroborationBonus: 5
  },
  {
    area: 'mecanica-transmision',
    include: [
      { term: 'ball bearing', weight: 50 }, { term: 'deep groove ball bearing', weight: 55 },
      { term: 'dowel pin', weight: 45 }, { term: 'hexagon socket head cap screw', weight: 50 },
      { term: 'aluminum extrusion profile', weight: 50 }, { term: 'bearing', weight: 25 },
      { term: 'rodamiento', weight: 45 }, { term: 'pasador cilindrico', weight: 45 },
      { term: 'tornillo de cabeza cilindrica', weight: 45 }, { term: 'perfil de aluminio', weight: 45 }
    ],
    exclude: [],
    manufacturerHints: ['skf', 'fag', 'ina', 'nsk', 'timken'],
    minScore: 35,
    manufacturerCorroborationMinProductScore: 30,
    manufacturerCorroborationBonus: 5
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
  // ("no es neumatico", "sin sistema neumatico"). "Sin embargo" is a discourse
  // connector, not a product negation, so it must not suppress later evidence.
  const start = Math.max(0, position - 3);
  for (let index = start; index < position; index += 1) {
    const token = tokens[index];
    if (token === 'sin' && tokens[index + 1] === 'embargo') continue;
    if (['non', 'not', 'no', 'sin'].includes(token)) return true;
  }
  return false;
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

function hasAnyEvidence(evidence, terms) {
  const normalizedTerms = new Set(terms.map(normalize));
  return evidence.some((item) => normalizedTerms.has(normalize(item.term)));
}

function isGenericOnlyEvidence(evidence) {
  // Generic nouns frequently occur in manuals and adjacent industries. They need
  // corroboration from a stronger class concept or technical context.
  const generic = new Set(['compressor', 'compresor', 'pneumatic', 'pneumatics', 'neumatico', 'neumatica', 'neumaticos', 'neumaticas']);
  return evidence.length > 0 && evidence.every((item) => generic.has(normalize(item.term)));
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
    const manufacturerScore = productScore >= (rule.manufacturerCorroborationMinProductScore ?? rule.minScore) && manufacturerHits.length > 0
      ? (rule.manufacturerCorroborationBonus ?? 0)
      : 0;
    const score = productScore + manufacturerScore - excludeHits.length * 80;
    const genericOnly = isGenericOnlyEvidence(validEvidence);
    const compressorOnly = validEvidence.length === 1 && hasAnyEvidence(validEvidence, ['compressor', 'compresor']);
    // Strong class concepts can pass directly. Generic compressor evidence is allowed
    // only with corroboration; this recovers real compact compressors without opening
    // weak textual mentions such as manuals or hybrid hydro-pneumatic products.
    const accepted = score >= rule.minScore
      && productScore > 0
      && excludeHits.length === 0
      && !(genericOnly && score < rule.minScore)
      && !(compressorOnly && manufacturerScore === 0 && productScore < 35);

    return {
      area: rule.area,
      score,
      accepted,
      evidence: {
        include_terms: validEvidence.map((item) => item.term),
        negated_terms: negatedHits.map((item) => item.term),
        exclude_terms: excludeHits.map((item) => item.term),
        manufacturer_hints: manufacturerHits,
        generic_only_evidence: genericOnly
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
