import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useLanguage } from '@/lib/i18n';

export default function CategoryCard({ area, count }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const Icon = area.icon;
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
            <span className="ip-muted text-[10px]">{count.toLocaleString()} {t.references}</span>
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