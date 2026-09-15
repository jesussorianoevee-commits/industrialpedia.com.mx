// The "5-second comparison" pattern (design brief #3): a score ring +
// state badge + one-line breakdown that answers "¿son compatibles?" without
// reading a table. The percentage is deliberately the plain equal/compared
// ratio already shown elsewhere in the UI (never invented, never a
// mystery number) -- the backend's cross_reference_score exists but isn't
// normalized to a 0-100 range, so using it here would risk a misleading
// percentage; the ratio is the one number on this page that's honestly a
// percentage.
import { compatStateFor, compatLabel } from '@/lib/compatibilityStates';

const BREAKDOWN_LABELS = {
  es: (equal, different, review) => `${equal} coinciden · ${different} diferencias · ${review} por revisar`,
  en: (equal, different, review) => `${equal} match · ${different} differences · ${review} to review`,
  de: (equal, different, review) => `${equal} übereinstimmend · ${different} Unterschiede · ${review} zu prüfen`,
  fr: (equal, different, review) => `${equal} correspondent · ${different} différences · ${review} à vérifier`,
  zh: (equal, different, review) => `${equal} 匹配 · ${different} 差异 · ${review} 待审核`,
};

export default function CompatibilityScore({ component, language = 'es', size = 'md' }) {
  const equal = component?.comparison?.equal || 0;
  const compared = component?.comparison?.compared || 0;
  const differences = Array.isArray(component?.comparison?.differences) ? component.comparison.differences : [];
  const different = differences.filter((d) => d?.state === 'different').length;
  const missing = differences.filter((d) => ['base_only', 'candidate_only', 'not_comparable'].includes(d?.state)).length;
  const pct = compared > 0 ? Math.round((equal / compared) * 100) : 0;
  const state = compatStateFor(component);
  const Icon = state.icon;
  const ringSize = size === 'sm' ? 48 : 64;
  const fontSize = size === 'sm' ? 11 : 14;
  const ringVar = state.key === 'no_match' ? '--ip-no-match' : `--ip-${state.key}`;

  return (
    <div className="flex items-center gap-3">
      <div
        className="ip-score-ring"
        style={{ '--ip-score-pct': pct, '--ip-score-color': `hsl(var(${ringVar}))`, width: ringSize, height: ringSize }}
        role="img"
        aria-label={`${pct}% ${compatLabel(component, language)}`}
      >
        <div className="ip-score-ring-value" style={{ fontSize }}>{pct}%</div>
      </div>
      <div className="min-w-0">
        <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${state.bgClass} ${state.textClass}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span aria-hidden="true">{state.symbol}</span>
          {compatLabel(component, language)}
        </div>
        <div className="mt-1 text-[11px] text-white/55">{(BREAKDOWN_LABELS[language] || BREAKDOWN_LABELS.es)(equal, different, missing)}</div>
      </div>
    </div>
  );
}
