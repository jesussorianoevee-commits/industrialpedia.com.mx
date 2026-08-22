import { ArrowRight } from 'lucide-react';

export default function CategoryCard({ area, count }) {
  const Icon = area.icon;
  return (
    <div className="bg-[#11161c]/90 border border-white/10 rounded-xl p-5 hover:border-[#5a9cd9]/35 hover:bg-[#141a21] transition-all group">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#5a9cd9]/10 border border-[#5a9cd9]/15 flex items-center justify-center">
            <Icon className="w-5 h-5 text-[#5a9cd9]" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">{area.name}</h3>
            <span className="text-white/30 text-[10px]">{count.toLocaleString()} referencias</span>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-[#5a9cd9] group-hover:translate-x-0.5 transition-all" />
      </div>
      <p className="text-white/45 text-xs leading-relaxed mb-4 max-w-xl">{area.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {area.subcategories.map((s) => (
          <span key={s} className="px-2.5 py-1 rounded-md bg-white/[.035] border border-white/10 text-white/45 text-[11px]">{s}</span>
        ))}
        <span className="px-2.5 py-1 rounded-md bg-[#5a9cd9]/5 border border-[#5a9cd9]/15 text-[#5a9cd9] text-[11px]">+{area.moreCount} más</span>
      </div>
    </div>
  );
}