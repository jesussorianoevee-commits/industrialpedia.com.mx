import { useState } from 'react';
import { AREAS, TOTAL_TYPES, getLocalizedArea } from '@/lib/taxonomy';
import CategoryCard from './CategoryCard';
import { useLanguage } from '@/lib/i18n';

export default function CategorySection({ counts }) {
  const { t, language } = useLanguage();
  const [showAll, setShowAll] = useState(false);
  const visibleAreas = showAll ? AREAS : AREAS.slice(0, 6);

  return (
    <section className="px-3 sm:px-5 py-6 sm:py-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="ip-text font-bold text-lg sm:text-xl">{t.exploreByArea}</h2>
          <p className="ip-muted text-[11px] mt-1">Selecciona un área para comenzar a explorar el catálogo.</p>
        </div>
        <span className="ip-muted text-[10px] text-right shrink-0">{AREAS.length} {t.areas} · {TOTAL_TYPES} {t.types}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {visibleAreas.map((a) => (
          <CategoryCard key={a.id} area={getLocalizedArea(a, language)} count={counts[a.statsKey || a.id] || 0} compact />
        ))}
      </div>

      {AREAS.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-3 w-full min-h-11 rounded-xl border border-border bg-secondary/40 ip-muted text-xs font-medium hover:border-primary/40 hover:ip-accent transition-colors"
        >
          {showAll ? 'Mostrar menos' : 'Ver más áreas'}
        </button>
      )}
    </section>
  );
}