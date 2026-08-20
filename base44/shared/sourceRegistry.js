// Source Registry v1
// Only domains with explicit manufacturer/partner evidence belong in the
// authorized tier. Generic distributors remain a lower, non-authorized tier.
// This registry is intentionally small and auditable; it grows from verified
// manufacturer partner pages rather than from domain-name guessing.

const normalize = (value) => String(value || '').toLowerCase().replace(/^www\./, '').trim();

export const SOURCE_REGISTRY = {
  'festo': {
    official: ['festo.com'],
    authorized_distributors: [
      'motion.com',
      'egaindustrial.com',
      'risoul.com.mx',
      'pimatic.com.mx',
      'suministrosmat.com',
      'sncmx.com',
      'autycom.com',
      'maicontrol.com',
      'vgr.com.mx',
      'gsamx.com',
      'azcontrolpuebla.com',
      'comercializadora-it.com',
      'integracion-total.com',
      'etka.mx',
      'sitsacv.com.mx'
    ]
  },
  'schneider electric': {
    official: ['se.com'],
    authorized_distributors: [
      'rexel.com',
      'nedco.ca',
      'bpx.co.uk',
      'crescent.com',
      'mayer-electric.com'
    ]
  },
  'bosch rexroth': {
    official: ['boschrexroth.com', 'boschrexroth.com.mx']
  },
  'siemens': { official: ['siemens.com'] },
  'omron': { official: ['omron.com'] },
  'keyence': { official: ['keyence.com'] },
  'smc': { official: ['smcworld.com'] },
  'ifm': { official: ['ifm.com'] },
  'sick': { official: ['sick.com'] },
  'balluff': { official: ['balluff.com'] },
  'phoenix contact': { official: ['phoenixcontact.com'] },
  'rockwell automation': { official: ['rockwellautomation.com'] },
  'allen bradley': { official: ['rockwellautomation.com'] },
  'mitsubishi electric': { official: ['mitsubishielectric.com'] },
  'yaskawa': { official: ['yaskawa.com'] },
  'fanuc': { official: ['fanuc.com'] },
  'eaton': { official: ['eaton.com'] },
  'turck': { official: ['turck.com'] },
  'pepperl+fuchs': { official: ['pepperl-fuchs.com'] },
  'wago': { official: ['wago.com'] },
  'festo didactic': { official: ['festo-didactic.com'] }
};

export function registryKey(value) {
  return normalize(value).replace(/[^a-z0-9+ ]/g, '').replace(/\s+/g, ' ').trim();
}

export function getSourcePolicy(manufacturer) {
  const key = registryKey(manufacturer);
  const entry = SOURCE_REGISTRY[key];
  if (!entry) return null;
  return {
    manufacturer: key,
    official: (entry.official || []).map(normalize),
    authorized_distributors: (entry.authorized_distributors || []).map(normalize)
  };
}

export function allAuthorizedDomains(policy) {
  if (!policy) return [];
  return [...new Set([...(policy.official || []), ...(policy.authorized_distributors || [])])];
}

export function classifyRegisteredDomain(host, policy) {
  const h = normalize(host);
  if (!policy || !h) return '';
  if ((policy.official || []).some((d) => h === d || h.endsWith(`.${d}`))) return 'official';
  if ((policy.authorized_distributors || []).some((d) => h === d || h.endsWith(`.${d}`))) return 'authorized_distributor';
  return '';
}
