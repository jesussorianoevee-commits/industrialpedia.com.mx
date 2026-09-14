import { useState } from 'react';
import { AREAS, TOTAL_TYPES, getLocalizedArea } from '@/lib/taxonomy';
import CategoryCard from './CategoryCard';
import { useLanguage } from '@/lib/i18n';

export default function CategorySection({ counts }) {
  const { t, language } = useLanguage();
  const [showAll, setShowAll] = useState(false);
  const visibleAreas = showAll ? AREAS : AREAS.slice(0, 6);

  return (
    <section className="px-3 sm:px-5 py-8 sm:py-12 max-w-5xl mx-auto w-full">
      <div className="rounded-[24px] border border-border/70 bg-secondary/[0.18] px-4 sm:px-6 py-5 sm:py-6">
      <div className="flex items-center justify-between gap-4 mb-5 sm:mb-6">
        <div>
          <h2 className="ip-text font-bold text-xl sm:text-2xl tracking-[-0.025em]">{t.exploreByArea}</h2>
          <p className="ip-muted text-[11px] sm:text-xs mt-1.5">Selecciona un área para comenzar a explorar el catálogo.</p>
        </div>
        <span className="ip-muted text-[10px] text-right shrink-0">{AREAS.length} {t.areas} · {TOTAL_TYPES} {t.types}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {visibleAreas.map((a) => (
          <CategoryCard
            key={a.id}
            area={getLocalizedArea(a, language)}
            count={counts && Object.prototype.hasOwnProperty.call(counts, a.statsKey || a.id)
              ? counts[a.statsKey || a.id]
              : null}
            compact
          />
        ))}
      </div>

      {AREAS.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-4 w-full min-h-11 rounded-xl border border-border bg-background/40 ip-muted text-xs font-medium hover:border-primary/40 hover:ip-accent transition-colors"
        >
          {showAll ? 'Mostrar menos' : 'Ver más áreas'}
        </button>
      )}
      </div>
    </section>
  );
}