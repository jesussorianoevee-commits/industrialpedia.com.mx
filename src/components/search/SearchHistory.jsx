import { Clock, Search } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function SearchHistory({ history, onSelect, onClear }) {
  const { t } = useLanguage();
  if (!history?.length) return null;
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
          <Clock className="w-3 h-3" /> {t.recentSearches}
        </div>
        <button onClick={onClear} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
          {t.clear}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {history.map((term, i) => (
          <button
            key={`${term}-${i}`}
            onClick={() => onSelect(term)}
            className="inline-flex items-center gap-1.5 text-xs text-white/70 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Search className="w-3 h-3 text-white/30" />
            {term}
          </button>
        ))}
      </div>
    </section>
  );
}