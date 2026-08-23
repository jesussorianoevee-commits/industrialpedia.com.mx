import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useLanguage, localizedCount } from '@/lib/i18n';

export default function CategoryCard({ area, count, compact = false }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const Icon = area.icon;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/buscar?area=${encodeURIComponent(area.statsKey || area.id)}`)}
        className="min-h-[118px] w-full text-left ip-surface border border-border rounded-xl p-3.5 sm:p-4 hover:border-primary/50 hover:-translate-y-0.5 transition-all group cursor-pointer"
        aria-label={`${t.viewComponent}: ${count.toLocaleString()} ${t.foundParts} · ${area.name}`}
      >
        <div className="flex items-start justify-between gap-2 h-full">
          <div className="min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
              <Icon className="w-4.5 h-4.5 ip-accent" />
            </div>
            <h3 className="ip-text font-semibold text-xs sm:text-sm leading-tight line-clamp-2">{area.name}</h3>
            <span className="ip-muted text-[10px] mt-1 block">{localizedCount(count, t.reference, t.references, language)}</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 ip-muted shrink-0 group-hover:ip-accent group-hover:translate-x-0.5 transition-all" />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(`/buscar?area=${encodeURIComponent(area.statsKey || area.id)}`)}
      className="w-full text-left ip-surface border border-border rounded-xl p-5 hover:border-primary/40 transition-all group cursor-pointer"
      aria-label={`${t.viewComponent}: ${count.toLocaleString()} ${t.foundParts} · ${area.name}`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Icon className="w-5 h-5 ip-accent" />
          </div>
          <div>
            <h3 className="ip-text font-semibold text-sm">{area.name}</h3>
            <span className="ip-muted text-[10px]">{localizedCount(count, t.reference, t.references, language)}</span>
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