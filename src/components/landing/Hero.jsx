import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ShieldCheck } from 'lucide-react';
import { POPULAR_TAGS } from '@/lib/taxonomy';

export default function Hero({ partCount, loading, lastUpdated }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const submit = (e) => { e.preventDefault(); if (q.trim()) navigate(`/buscar?q=${encodeURIComponent(q.trim())}`); };

  return (
    <section className="px-5 pt-16 pb-10 md:pt-24 md:pb-16 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 ip-muted text-[10px] mb-6 tracking-[0.16em] uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/.7)]" />
        {loading ? 'Cargando catálogo…' : `${partCount.toLocaleString()} refacciones`}
      </div>
      {!loading && lastUpdated && (
        <div className="text-[10px] ip-muted -mt-3 mb-5 opacity-70">
          Actualizado automáticamente · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      <h1 className="text-[42px] md:text-[68px] leading-[0.98] font-bold tracking-[-0.045em] ip-text mb-5 max-w-4xl mx-auto">
        Encuentra tu <span className="ip-accent">refacción</span><br className="hidden sm:block" /> en segundos.
      </h1>
      <p className="ip-muted text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-8">
        Información técnica para buscar, encontrar, comparar y decidir. Consulta por número de parte, fabricante o especificación.
      </p>
      <form onSubmit={submit} className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 ip-surface border border-border rounded-2xl p-2 focus-within:border-primary/60 transition-all">
          <Search className="w-5 h-5 ip-muted ml-2 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número de parte, fabricante, descripción..." className="bg-transparent flex-1 text-sm md:text-base ip-text placeholder:text-muted-foreground/60 outline-none py-3 min-w-0" />
          <button type="submit" className="ip-accent-bg text-sm font-semibold px-5 py-3 rounded-xl transition-transform hover:scale-[1.02] active:scale-[.98]">Buscar</button>
        </div>
      </form>
      <div className="flex items-center justify-center flex-wrap gap-2 mt-5">
        <span className="ip-muted text-[10px] uppercase tracking-wider mr-1">Ejemplos</span>
        {POPULAR_TAGS.slice(0, 6).map((t) => <button key={t} onClick={() => navigate(`/buscar?q=${encodeURIComponent(t)}`)} className="px-2.5 py-1.5 rounded-md bg-secondary border border-border ip-muted text-[11px] hover:text-primary transition-colors">{t}</button>)}
      </div>
      <div className="mt-10 flex items-center justify-center gap-5 ip-muted text-[11px]">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 ip-accent" /> Información estructurada</span>
        <span className="hidden sm:inline opacity-30">•</span>
        <span className="hidden sm:inline-flex items-center gap-1.5"><ArrowRight className="w-3.5 h-3.5 ip-accent" /> Hasta 5 alternativas</span>
      </div>
    </section>
  );
}