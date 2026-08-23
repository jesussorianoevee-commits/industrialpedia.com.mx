import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ShieldCheck, Clock, Loader2, Globe } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { POPULAR_TAGS } from '@/lib/taxonomy';
import { useLanguage } from '@/lib/i18n';

export default function Hero({ partCount, loading, lastUpdated }) {
  const [q, setQ] = useState('');
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('industrialpedia_search_history') || '[]'); } catch { return []; } });
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const suggestionTimer = useRef(null);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const saveToHistory = (term) => { const clean = String(term || '').trim(); if (!clean) return; setHistory((prev) => { const next = [clean, ...prev.filter((s) => s !== clean)].slice(0, 8); try { localStorage.setItem('industrialpedia_search_history', JSON.stringify(next)); } catch {} return next; }); };
  const historySuggestions = q.trim().length >= 2 ? history.filter((term) => term.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5) : [];
  useEffect(() => { const term = q.trim(); if (suggestionTimer.current) clearTimeout(suggestionTimer.current); if (term.length < 2) { setSuggestions([]); setSuggestionsLoading(false); return; } suggestionTimer.current = setTimeout(async () => { setSuggestionsLoading(true); try { const res = await base44.functions.invoke('SugerenciasBuscar', { q: term }); setSuggestions((res.data?.suggestions || []).slice(0, 6)); } catch { setSuggestions([]); } finally { setSuggestionsLoading(false); } }, 180); return () => suggestionTimer.current && clearTimeout(suggestionTimer.current); }, [q]);
  const goSearch = (term) => { const clean = String(term || '').trim(); if (!clean) return; saveToHistory(clean); setShowDropdown(false); navigate('/buscar?q=' + encodeURIComponent(clean)); };
  const submit = (e) => { e.preventDefault(); goSearch(q); };

  return (
    <section className="px-3 sm:px-5 pt-8 sm:pt-14 pb-8 sm:pb-12 md:pt-20 md:pb-16 text-center">
      <div className="max-w-5xl mx-auto rounded-[28px] sm:rounded-[32px] border border-border/80 bg-gradient-to-b from-primary/[0.035] to-transparent px-3 sm:px-8 py-8 sm:py-12 md:py-16 shadow-[0_18px_60px_-40px_hsl(var(--primary)/.35)]">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 ip-muted text-[10px] mb-5 tracking-[0.16em] uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/.7)]" />
        {loading ? t.loadingParts : `${partCount.toLocaleString()} ${t.foundParts}`}
      </div>
      {!loading && lastUpdated && (
        <div className="text-[10px] ip-muted -mt-3 mb-5 opacity-70">
          {t.updatedAutomatically} · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      <h1 className="text-[38px] sm:text-[48px] md:text-[72px] leading-[0.96] font-bold tracking-[-0.05em] ip-text mb-5 max-w-4xl mx-auto">
        {t.findYourPart} <span className="ip-accent">{t.sparePart}</span><br className="hidden sm:block" /> {t.inSeconds}
      </h1>
      <p className="ip-muted text-sm md:text-base leading-relaxed max-w-xl mx-auto mb-7 sm:mb-9">
        {t.searchParts}
      </p>
      <form onSubmit={submit} className="max-w-3xl mx-auto relative">
        <div className="flex items-center gap-2 ip-surface border border-border rounded-2xl p-2 shadow-[0_16px_45px_-28px_rgba(0,0,0,.7)] focus-within:border-primary/70 focus-within:ring-4 focus-within:ring-primary/10 transition-all">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/10 flex items-center justify-center ml-1 shrink-0">
            <Search className="w-5 h-5 ip-accent" />
          </div>
          <input value={q} onChange={(e) => { setQ(e.target.value); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} placeholder={t.searchPlaceholder} className="bg-transparent flex-1 text-sm md:text-base ip-text placeholder:text-muted-foreground/60 outline-none py-3.5 min-w-0" />
          <button type="submit" className="ip-accent-bg text-sm font-semibold px-4 sm:px-6 py-3.5 rounded-xl shrink-0 shadow-sm transition-transform hover:scale-[1.02] active:scale-[.98]">{t.search}</button>
        </div>
        {showDropdown && q.trim().length >= 2 && (historySuggestions.length > 0 || suggestionsLoading || suggestions.length > 0) && (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-border ip-surface shadow-2xl text-left">
            {historySuggestions.length > 0 && <div className="border-b border-border"><div className="px-4 py-2 text-[10px] uppercase tracking-wider ip-muted flex items-center gap-1.5"><Clock className="w-3 h-3" /> {t.recentSearches}</div>{historySuggestions.map((term, i) => <button key={'history-'+term+'-'+i} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => goSearch(term)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary"><Clock className="w-3.5 h-3.5 ip-muted" /><span className="text-sm ip-text truncate">{term}</span></button>)}</div>}
            {suggestionsLoading ? <div className="px-4 py-4 text-xs ip-muted flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t.discoveringProducts}</div> : <div className="max-h-[360px] overflow-y-auto">{suggestions.map((s, i) => <button key={(s.part_number || s.text)+'-'+i} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => goSearch(s.part_number || s.text)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border last:border-0 hover:bg-secondary">{s.image ? <img src={s.image} alt="" className="h-10 w-10 rounded-lg object-contain bg-white shrink-0" /> : <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0"><Globe className="w-4 h-4 ip-muted" /></div>}<div className="min-w-0 flex-1"><div className="text-sm font-medium ip-text truncate">{s.text || 'Producto'}</div><div className="mt-0.5 flex gap-2 text-xs ip-muted">{s.part_number && <span className="font-mono">{s.part_number}</span>}{s.manufacturer && <span>{s.manufacturer}</span>}</div></div><span className="ip-muted">›</span></button>)}</div>}
          </div>
        )}
      </form>
      <div className="flex items-center justify-center flex-wrap gap-2 mt-5 sm:mt-6">
        <span className="ip-muted text-[10px] uppercase tracking-wider mr-1">{t.examples}</span>
        {POPULAR_TAGS.slice(0, 6).map((t) => <button key={t} onClick={() => navigate(`/buscar?q=${encodeURIComponent(t)}`)} className="px-2.5 py-1.5 rounded-md bg-secondary border border-border ip-muted text-[11px] hover:text-primary transition-colors">{t}</button>)}
      </div>
      <div className="mt-8 sm:mt-10 pt-5 border-t border-border/60 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 ip-muted text-[11px]">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 ip-accent" /> {t.structuredInfo}</span>
        <span className="hidden sm:inline opacity-30">•</span>
        <span className="hidden sm:inline-flex items-center gap-1.5"><ArrowRight className="w-3.5 h-3.5 ip-accent" /> {t.upToFiveAlternatives}</span>
      </div>
      </div>
    </section>
  );
}