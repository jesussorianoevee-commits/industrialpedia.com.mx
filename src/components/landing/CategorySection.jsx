import { AREAS, TOTAL_TYPES } from '@/lib/taxonomy';
import CategoryCard from './CategoryCard';

export default function CategorySection({ counts }) {
  return (
    <section className="px-5 py-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-white font-bold text-lg">Explora por área</h2>
        <span className="text-white/40 text-xs">{AREAS.length} áreas · {TOTAL_TYPES} tipos</span>
      </div>
      <div className="space-y-3">
        {AREAS.map((a) => (
          <CategoryCard key={a.id} area={a} count={counts[a.statsKey || a.id] || 0} />
        ))}
      </div>
    </section>
  );
}