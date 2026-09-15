import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useLanguage, localizedCount } from '@/lib/i18n';

export default function CategoryCard({ area, count, compact = false, tone = 'primary' }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const Icon = area.icon;
  const hasCount = Number.isFinite(count);
  const countLabel = hasCount ? localizedCount(count, t.reference, t.references, language) : `— ${t.references}`;
  const isAlt = tone === 'accent-2';

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/buscar?area=${encodeURIComponent(area.statsKey || area.id)}`)}
        className={`min-h-[126px] w-full text-left ip-surface border border-border/80 rounded-2xl p-3.5 sm:p-4 shadow-[0_1px_2px_rgba(0,0,0,.3)] hover:-translate-y-0.5 transition-all group cursor-pointer ${isAlt ? 'hover:border-accent-2/50 hover:shadow-[0_14px_30px_-24px_hsl(var(--accent-2)/.6)]' : 'hover:border-primary/50 hover:shadow-[0_14px_30px_-24px_hsl(var(--primary)/.6)]'}`}
        aria-label={`${t.viewComponent}: ${hasCount ? count.toLocaleString() : 'sin conteo disponible'} ${t.foundParts} · ${area.name}`}
      >
        <div className="flex items-start justify-between gap-2 h-full">
          <div className="min-w-0">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3 ${isAlt ? 'bg-accent-2/10 border-accent-2/15 group-hover:bg-accent-2/15' : 'bg-primary/10 border-primary/15 group-hover:bg-primary/15'}`}>
              <Icon className={`w-5 h-5 ${isAlt ? 'text-accent-2' : 'ip-accent'}`} />
            </div>
            <h3 className="ip-text font-semibold text-sm leading-tight line-clamp-2">{area.name}</h3>
            <span className="ip-muted text-[10px] mt-1.5 block">{countLabel}</span>
          </div>
          <ArrowRight className={`w-4 h-4 ip-muted shrink-0 group-hover:translate-x-0.5 transition-all ${isAlt ? 'group-hover:text-accent-2' : 'group-hover:ip-accent'}`} />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(`/buscar?area=${encodeURIComponent(area.statsKey || area.id)}`)}
      className="w-full text-left ip-surface border border-border rounded-xl p-5 shadow-[0_1px_2px_rgba(0,0,0,.3)] hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_hsl(var(--primary)/.5)] transition-all group cursor-pointer"
      aria-label={`${t.viewComponent}: ${count.toLocaleString()} ${t.foundParts} · ${area.name}`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3">
            <Icon className="w-5 h-5 ip-accent" />
          </div>
          <div>
            <h3 className="ip-text font-semibold text-sm">{area.name}</h3>
            <span className="ip-muted text-[10px]">{countLabel}</span>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 ip-muted group-hover:ip-accent group-hover:translate-x-0.5 transition-all" />
      </div>
      <p className="ip-muted text-xs leading-relaxed mb-4 max-w-xl">{area.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {area.subcategories.map((s) => (
          <span key={s} className="px-2.5 py-1 rounded-md bg-secondary border border-border ip-muted text-[11px]">{s}</span>
        ))}
        {area.moreCount > 0 && (
          <span className="px-2.5 py-1 rounded-md bg-primary/5 border border-primary/15 ip-accent text-[11px]">+{area.moreCount} {t.more} </span>
        )}
      </div>
    </button>
  );
}