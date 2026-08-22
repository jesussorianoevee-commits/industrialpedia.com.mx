import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ShieldCheck } from 'lucide-react';
import { POPULAR_TAGS } from '@/lib/taxonomy';

export default function Hero({ partCount, loading }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/buscar?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <section className="px-5 pt-16 pb-10 md:pt-24 md:pb-16 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#5a9cd9]/20 bg-[#5a9cd9]/5 text-[10px] text-white/55 mb-6 tracking-[0.16em] uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-[#5a9cd9] shadow-[0_0_8px_rgba(90,156,217,.8)]" />
        {loading ? 'Knowledge Core' : `${partCount.toLocaleString()} refacciones publicadas`}
      </div>

      <h1 className="text-[42px] md:text-[68px] leading-[0.98] font-bold tracking-[-0.045em] text-white mb-5 max-w-4xl mx-auto">
        Encuentra tu <span className="text-[#5a9cd9]">refacción</span><br className="hidden sm:block" /> en segundos.
      </h1>

      <p className="text-white/50 text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-8">
        Información técnica para buscar, encontrar, comparar y decidir. Consulta por número de parte, fabricante o especificación.
      </p>

      <form onSubmit={submit} className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 bg-[#12171d] border border-white/10 rounded-2xl p-2 focus-within:border-[#5a9cd9]/60 focus-within:shadow-[0_0_0_4px_rgba(90,156,217,.08)] transition-all">
          <Search className="w-5 h-5 text-white/35 ml-2 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Número de parte, fabricante, descripción..."
            className="bg-transparent flex-1 text-sm md:text-base text-white placeholder:text-white/25 outline-none py-3 min-w-0"
          />
          <button type="submit" className="ip-accent-bg text-sm font-semibold px-5 py-3 rounded-xl transition-transform hover:scale-[1.02] active:scale-[.98]">Buscar</button>
        </div>
      </form>

      <div className="flex items-center justify-center flex-wrap gap-2 mt-5">
        <span className="text-[10px] uppercase tracking-wider text-white/25 mr-1">Ejemplos</span>
        {POPULAR_TAGS.slice(0, 6).map((t) => (
          <button key={t} onClick={() => navigate(`/buscar?q=${encodeURIComponent(t)}`)} className="px-2.5 py-1.5 rounded-md bg-white/[.025] border border-white/10 text-white/45 text-[11px] hover:text-[#5a9cd9] hover:border-[#5a9cd9]/30 transition-colors">{t}</button>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-center gap-5 text-[11px] text-white/35">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-[#5a9cd9]" /> Información estructurada</span>
        <span className="hidden sm:inline text-white/10">•</span>
        <span className="hidden sm:inline-flex items-center gap-1.5"><ArrowRight className="w-3.5 h-3.5 text-[#5a9cd9]" /> Hasta 5 alternativas</span>
      </div>
    </section>
  );
}