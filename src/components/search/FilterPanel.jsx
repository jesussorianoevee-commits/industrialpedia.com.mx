import { Filter, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function FilterPanel({ facets, filters, onChange, onReset }) {
  const { t } = useLanguage();
  const toggle = (key, value) => {
    const arr = filters[key] || [];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    onChange({ ...filters, [key]: next });
  };

  const active = (filters.manufacturers?.length || 0) + (filters.categories?.length || 0) + (filters.has_specification ? 1 : 0) + (filters.only_published === false ? 1 : 0);

  return (
    <div className="ip-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
          <Filter className="w-4 h-4" /> {t.filters}
          {active > 0 && <span className="text-[10px] bg-[#5a9cd9] text-[#0a0e12] px-1.5 rounded-full font-semibold">{active}</span>}
        </div>
        {active > 0 && (
          <button onClick={onReset} className="flex items-center gap-1 text-white/40 hover:text-white text-[11px]">
            <X className="w-3 h-3" /> {t.clear}
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.only_published !== false}
          onChange={(e) => onChange({ ...filters, only_published: e.target.checked })}
          className="accent-[#5a9cd9]"
        />
        <span className="text-white/70 text-xs">{t.publishedKnowledge}</span>
      </label>

      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={!!filters.has_specification}
          onChange={(e) => onChange({ ...filters, has_specification: e.target.checked })}
          className="accent-[#5a9cd9]"
        />
        <span className="text-white/70 text-xs">{t.technicalSpecification}</span>
      </label>

      {facets.manufacturers.length > 0 && (
        <div className="mb-4">
          <div className="text-white/40 text-[11px] uppercase tracking-wide mb-2">{t.manufacturer}</div>
          <div className="space-y-1.5">
            {facets.manufacturers.map((m) => (
              <label key={m.name} className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2 text-white/70 text-xs">
                  <input
                    type="checkbox"
                    checked={(filters.manufacturers || []).includes(m.name)}
                    onChange={() => toggle('manufacturers', m.name)}
                    className="accent-[#5a9cd9]"
                  />
                  {m.name}
                </span>
                <span className="text-white/30 text-[11px]">{m.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {facets.categories.length > 0 && (
        <div>
          <div className="text-white/40 text-[11px] uppercase tracking-wide mb-2">{t.category}</div>
          <div className="space-y-1.5">
            {facets.categories.map((c) => (
              <label key={c.name} className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2 text-white/70 text-xs">
                  <input
                    type="checkbox"
                    checked={(filters.categories || []).includes(c.name)}
                    onChange={() => toggle('categories', c.name)}
                    className="accent-[#5a9cd9]"
                  />
                  {c.name}
                </span>
                <span className="text-white/30 text-[11px]">{c.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}