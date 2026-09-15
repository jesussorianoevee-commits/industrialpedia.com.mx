// Canonical 4-state compatibility vocabulary (design brief #4): every
// comparison result maps to exactly one of MATCH / PARTIAL / REVIEW /
// NO_MATCH, always rendered with symbol + text + color + structure together
// -- never color alone. This replaces the two separate, inconsistently-named
// state maps that used to live duplicated in Comparar.jsx (STATE +
// DECISION_VISUAL, with `review` relabeled "SIMILAR" in one and not the
// other) and copy-pasted again into CompararSeleccion.jsx.
//
// Mapping from the real backend states (compare_parts_batch_public_v1's
// comparison.state): 'compatible' is an unambiguous MATCH; 'not_compatible'
// is an unambiguous NO_MATCH; 'review' means some specs differ but nothing
// critical failed -- that's a PARTIAL match, not a request for the user to
// go investigate; 'insufficient' means there isn't enough evidence to judge
// at all, which is exactly what the brief's own REVIEW state describes
// ("información insuficiente, ambigua o una condición que requiere
// validación"). Nothing here is invented -- it's a straight rename/merge of
// states the backend already returns.
import { CheckCircle2, AlertTriangle, HelpCircle, XCircle } from 'lucide-react';

export const COMPAT_STATES = {
  match: {
    key: 'match', symbol: '✓', icon: CheckCircle2,
    label: { es: 'COINCIDE', en: 'MATCH', de: 'ÜBEREINSTIMMUNG', fr: 'CORRESPOND', zh: '匹配' },
    textClass: 'ip-state-text-match', bgClass: 'ip-state-bg-match', ringClass: 'ip-state-ring-match',
  },
  partial: {
    key: 'partial', symbol: '≈', icon: AlertTriangle,
    label: { es: 'PARCIAL', en: 'PARTIAL', de: 'TEILWEISE', fr: 'PARTIEL', zh: '部分匹配' },
    textClass: 'ip-state-text-partial', bgClass: 'ip-state-bg-partial', ringClass: 'ip-state-ring-partial',
  },
  review: {
    key: 'review', symbol: '!', icon: HelpCircle,
    label: { es: 'REVISAR', en: 'REVIEW', de: 'PRÜFEN', fr: 'À VÉRIFIER', zh: '需审核' },
    textClass: 'ip-state-text-review', bgClass: 'ip-state-bg-review', ringClass: 'ip-state-ring-review',
  },
  no_match: {
    key: 'no_match', symbol: '×', icon: XCircle,
    label: { es: 'NO COINCIDE', en: 'NO MATCH', de: 'KEINE ÜBEREINSTIMMUNG', fr: 'NE CORRESPOND PAS', zh: '不匹配' },
    textClass: 'ip-state-text-no_match', bgClass: 'ip-state-bg-no_match', ringClass: 'ip-state-ring-no_match',
  },
};

const BACKEND_TO_COMPAT_KEY = {
  compatible: 'match',
  review: 'partial',
  insufficient: 'review',
  not_compatible: 'no_match',
};

/** Maps a raw backend comparison.state (or a component with one) to a COMPAT_STATES entry. Unknown/missing states fall back to 'review' (never silently treated as a match). */
export function compatStateFor(stateOrComponent) {
  const raw = typeof stateOrComponent === 'string' ? stateOrComponent : stateOrComponent?.comparison?.state;
  return COMPAT_STATES[BACKEND_TO_COMPAT_KEY[raw]] || COMPAT_STATES.review;
}

export function compatLabel(stateOrComponent, language = 'es') {
  const s = compatStateFor(stateOrComponent);
  return s.label[language] || s.label.es;
}
