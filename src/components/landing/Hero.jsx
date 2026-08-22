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
    <section className="px-5 pt-16 pb-10 md:pt-24 md:pb-16 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 ip-muted text-[10px] mb-6 tracking-[0.16em] uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/.7)]" />
        {loading ? t.loadingParts : `${partCount.toLocaleString()} ${t.foundParts}`}
      </div>
      {!loading && lastUpdated && (
        <div className="text-[10px] ip-muted -mt-3 mb-5 opacity-70">
          {t.updatedAutomatically} · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      <h1 className="text-[42px] md:text-[68px] leading-[0.98] font-bold tracking-[-0.045em] ip-text mb-5 max-w-4xl mx-auto">
        {t.findYourPart} <span className="ip-accent">{t.sparePart}</span><br className="hidden sm:block" /> {t.inSeconds}
      </h1>
      <p className="ip-muted text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-8">
        {t.searchParts}
      </p>
      <form onSubmit={submit} className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 ip-surface border border-border rounded-2xl p-2 focus-within:border-primary/60 transition-all">
          <Search className="w-5 h-5 ip-muted ml-2 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPlaceholder} className="bg-transparent flex-1 text-sm md:text-base ip-text placeholder:text-muted-foreground/60 outline-none py-3 min-w-0" />
          <button type="submit" className="ip-accent-bg text-sm font-semibold px-5 py-3 rounded-xl transition-transform hover:scale-[1.02] active:scale-[.98]">{t.search}</button>
        </div>
      </form>
      <div className="flex items-center justify-center flex-wrap gap-2 mt-5">
        <span className="ip-muted text-[10px] uppercase tracking-wider mr-1">{t.examples}</span>
        {POPULAR_TAGS.slice(0, 6).map((t) => <button key={t} onClick={() => navigate(`/buscar?q=${encodeURIComponent(t)}`)} className="px-2.5 py-1.5 rounded-md bg-secondary border border-border ip-muted text-[11px] hover:text-primary transition-colors">{t}</button>)}
      </div>
      <div className="mt-10 flex items-center justify-center gap-5 ip-muted text-[11px]">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 ip-accent" /> {t.structuredInfo}</span>
        <span className="hidden sm:inline opacity-30">•</span>
        <span className="hidden sm:inline-flex items-center gap-1.5"><ArrowRight className="w-3.5 h-3.5 ip-accent" /> {t.upToFiveAlternatives}</span>
      </div>
    </section>
  );
}