import { ArrowRight } from 'lucide-react';

export default function CategoryCard({ area, count }) {
  const Icon = area.icon;
  return (
    <div className="bg-[#161a20] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
            <Icon className="w-5 h-5 text-[#5a9cd9]" />
          </div>
          <h3 className="text-white font-semibold text-sm">{area.name}</h3>
        </div>
        <span className="text-white/40 text-xs">{count.toLocaleString()} refs</span>
      </div>
      <p className="text-white/50 text-xs leading-relaxed mb-3">{area.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {area.subcategories.map((s) => (
          <span
            key={s}
            className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/55 text-[11px]"
          >
            {s}
          </span>
        ))}
        <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[#e68a00] text-[11px]">
          +{area.moreCount} más
        </span>
      </div>
      <div className="flex justify-end mt-3">
        <button className="text-white/70 text-xs font-medium flex items-center gap-1 hover:text-white">
          Ver todo <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}