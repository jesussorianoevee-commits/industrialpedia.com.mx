import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { POPULAR_TAGS } from '@/lib/taxonomy';

export default function Hero({ partCount, loading }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/buscar?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <section className="px-5 pt-10 pb-8 text-center">
      <div className="inline-flex items-center gap-2 text-[11px] text-white/40 mb-5 tracking-wide">
        <span className="text-[#5a9cd9]">•</span>
        {loading ? 'Cargando Knowledge Core…' : `${partCount.toLocaleString()} refacciones publicadas`}
      </div>
      <h1 className="text-[28px] leading-tight font-bold text-white mb-3">
        Encuentra tu <span className="text-[#5a9cd9]">refacción</span> en segundos
      </h1>
      <p className="text-white/55 text-sm leading-relaxed max-w-md mx-auto mb-6">
        Encuentra las refacciones que necesitas por número de parte, fabricante o especificación técnica. Posibles reemplazos entre marcas en segundos.
      </p>
      <form onSubmit={submit} className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 bg-[#161a20] border border-white/10 rounded-full pl-4 pr-1.5 py-1.5 focus-within:border-[#5a9cd9]/50 transition-colors">
          <Search className="w-4 h-4 text-white/40 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej: Siemens, Festo, SKF, Fanuc,"
            className="bg-transparent flex-1 text-sm text-white placeholder:text-white/30 outline-none py-1.5"
          />
          <button
            type="submit"
            className="bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-sm font-semibold px-4 py-2 rounded-full transition-colors"
          >
            Buscar
          </button>
        </div>
      </form>
      <div className="flex items-center justify-center flex-wrap gap-2 mt-4">
        {POPULAR_TAGS.map((t) => (
          <button
            key={t}
            onClick={() => navigate(`/buscar?q=${encodeURIComponent(t)}`)}
            className="px-3 py-1.5 rounded-full bg-[#161a20] border border-white/10 text-white/60 text-xs hover:text-white hover:border-white/20 transition-colors"
          >
            {t}
          </button>
        ))}
      </div>
    </section>
  );
}