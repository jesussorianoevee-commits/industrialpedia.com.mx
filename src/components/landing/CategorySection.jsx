import { AREAS, TOTAL_TYPES } from '@/lib/taxonomy';
import CategoryCard from './CategoryCard';
import { useLanguage } from '@/lib/i18n';

export default function CategorySection({ counts }) {
  const { t } = useLanguage();
  return (
    <section className="px-5 py-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-white font-bold text-lg">{t.exploreByArea}</h2>
        <span className="text-white/40 text-xs">{AREAS.length} {t.areas} · {TOTAL_TYPES} {t.types}</span>
      </div>
      <div className="space-y-3">
        {AREAS.map((a) => (
          <CategoryCard key={a.id} area={a} count={counts[a.statsKey || a.id] || 0} />
        ))}
      </div>
    </section>
  );
}