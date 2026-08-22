import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Search, ArrowLeft, SlidersHorizontal, Loader2, Globe, Clock, Cog } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResultCard from '@/components/search/ResultCard';
import FichaIndustrialpedia from '@/components/search/FichaIndustrialpedia';
import FilterPanel from '@/components/search/FilterPanel';
import EmptyState from '@/components/search/EmptyState';
import { AREAS } from '@/lib/taxonomy';
import { getIndustrialpediaAreaParts } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { translateParts, useLanguage } from '@/lib/i18n';
import IndustrialpediaLoader from '@/components/ui/IndustrialpediaLoader';

const DEFAULT_FILTERS = { manufacturers: [], categories: [], has_specification: false, only_published: false };

export default function Buscar() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const area = params.get('area') || '';
  const areaLabel = AREAS.find((a) => (a.statsKey || a.id) === area)?.name || area;
  const [input, setInput] = useState(q);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { language, t } = useLanguage();

  const [kcData, setKcData] = useState(null);
  const [kcLoading, setKcLoading] = useState(false);
  const [kcError, setKcError] = useState(null);

  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionTimer = useRef(null);
  const searchReqId = useRef(0);

  const [ficha, setFicha] = useState(null);
  const [fichaLoading, setFichaLoading] = useState(false);
  const [fichaError, setFichaError] = useState(null);

  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('industrialpedia_search_history') || '[]'); }
    catch { return []; }
  });

  const saveToHistory = (term) => {
    if (!term.trim()) return;
    setHistory((prev) => {
      const next = [term, ...prev.filter((s) => s !== term)].slice(0, 8);
      try { localStorage.setItem('industrialpedia_search_history', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const runAreaBrowse = useCallback(async (areaKey) => {
    const reqId = ++searchReqId.current;
    setKcLoading(true);
    setKcData(null);
    setKcError(null);
    try {
      const res = await getIndustrialpediaAreaParts(areaKey, 25, 0);
      if (searchReqId.current !== reqId) return;
      setKcData({ knowledge_core_results: res.results, discovery_results: [], web_results: [], facets: { manufacturers: [], categories: [] }, meta: { mode: 'area', area: areaKey, total: res.total } });
    } catch (e) {
      if (searchReqId.current !== reqId) return;
      setKcData(null);
      setKcError(e.message || 'Error al cargar las refacciones');
    } finally {
      if (searchReqId.current === reqId) setKcLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (query, f) => {
    const reqId = ++searchReqId.current;
    setKcLoading(true);
    setKcData(null);
    setKcError(null);
    try {
      const validation_states = f.only_published === false ? ['published', 'validated', 'incomplete', 'candidate'] : ['published'];
      const res = await base44.functions.invoke('IndustrialpediaSearch', {
        q: query,
        filters: {
          manufacturers: f.manufacturers,
          categories: f.categories,
          has_specification: f.has_specification,
          validation_states
        },
        limit: 25,
        offset: 0
      });
      if (searchReqId.current !== reqId) return;
      setKcData(res.data);
    } catch (e) {
      if (searchReqId.current !== reqId) return;
      setKcData(null);
      setKcError(e.message || 'Error en la búsqueda');
    } finally {
      if (searchReqId.current === reqId) {
        setKcLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setInput(q);
    if (area) {
      runAreaBrowse(area);
    } else if (q) {
      runSearch(q, filters);
    } else {
      setKcData(null);
      setKcError(null);
    }
  }, [q, area, filters, runSearch, runAreaBrowse]);

  // Autocompletado determinístico: consulta únicamente nuestro Knowledge Core,
  // DiscoveryIndex y Manufacturer. Nunca llama Tavily/Google mientras se escribe.
  useEffect(() => {
    const term = input.trim();
    if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    if (term.length < 2 || term === q.trim()) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    suggestionTimer.current = setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const res = await base44.functions.invoke('SugerenciasBuscar', { q: term });
        const items = (res.data?.suggestions || []).slice(0, 8).map((r) => ({
          title: r.text || 'Producto',
          partNumber: r.part_number || '',
          manufacturer: r.manufacturer || '',
          image: r.image || '',
          result: r
        }));
        setSuggestions(items);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 180);
    return () => suggestionTimer.current && clearTimeout(suggestionTimer.current);
  }, [input, q]);

  const submit = (e) => {
    e.preventDefault();
    const next = input.trim();
    if (next) {
      saveToHistory(next);
      setSuggestions([]);
      setParams({ q: next });
    }
  };

  const onReset = () => {
    setFilters(DEFAULT_FILTERS);
    setInput('');
    navigate('/buscar');
  };

  const kcResults = kcData?.knowledge_core_results || [];
  const discoveryResults = kcData?.discovery_results || [];

  // Localize the current result page in one batch. The original Part record
  // remains the fallback and technical identifiers are never translated.
  useEffect(() => {
    let cancelled = false;
    const localize = async () => {
      if (!kcData || kcResults.length === 0) return;
      if (kcResults.every((result) => result?.translation_language === language)) return;
      const localized = await translateParts(kcResults, language);
      if (cancelled) return;
      if (localized !== kcResults) setKcData((prev) => prev ? { ...prev, knowledge_core_results: localized } : prev);
    };
    localize();
    return () => { cancelled = true; };
  }, [language, kcResults, kcData]);
  const facets = kcData?.facets || { manufacturers: [], categories: [] };

  return (
    <div className="min-h-screen bg-[#0a0e12] grid-bg">
      <header className="sticky top-0 z-30 bg-[#0a0e12]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <form onSubmit={submit} className="relative mx-auto max-w-2xl flex items-center gap-2 bg-[#161a20] border border-white/10 rounded-full pl-3 pr-1.5 py-1">
          <Link to="/" className="text-white/50 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Search className="w-4 h-4 text-white/40" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setShowHistory(true)}
            placeholder={t.searchPlaceholder}
            className="bg-transparent flex-1 text-sm text-white placeholder:text-white/30 outline-none py-1.5"
            autoFocus
          />
          <button type="submit" className="bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-sm font-semibold px-4 py-1.5 rounded-full transition-colors">
            {t.search}
          </button>

          {showHistory && history.length > 0 && input.trim().length < 3 && !(input.trim() !== q.trim() && suggestions.length > 0) && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#11161c] shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
                  <Clock className="w-3 h-3" /> {t.recentSearches}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setHistory([]); try { localStorage.removeItem('industrialpedia_search_history'); } catch {} }}
                  className="text-[10px] text-white/30 hover:text-white/60"
                >
                  {t.clear}
                </button>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {history.map((term, i) => (
                  <button
                    key={`${term}-${i}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setInput(term); setShowHistory(false); setParams({ q: term }); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/5 last:border-0 hover:bg-white/5"
                  >
                    <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
                    <span className="text-sm text-white/75 truncate">{term}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {input.trim().length >= 3 && input.trim() !== q.trim() && (suggestionsLoading || suggestions.length > 0) && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#11161c] shadow-2xl">
              {suggestionsLoading ? (
                <div className="px-4 py-4 text-xs text-white/40 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t.discoveringProducts}</div>
              ) : (
                <div className="max-h-[430px] overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button
                      key={`${s.partNumber}-${s.title}-${i}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const value = s.partNumber || s.title;
                        saveToHistory(value);
                        setSuggestions([]);
                        setInput(value);
                        setParams({ q: value });
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                    >
                      {s.image ? (
                        <img src={s.image} alt="" className="h-11 w-11 rounded-lg object-contain bg-white" />
                      ) : (
                        <div className="h-11 w-11 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                          <Globe className="w-4 h-4 text-white/30" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate">{s.title}</div>
                        <div className="mt-0.5 flex gap-2 text-xs text-white/45">
                          {s.partNumber && <span className="font-mono text-white/65">{s.partNumber}</span>}
                          {s.manufacturer && <span>{s.manufacturer}</span>}
                        </div>
                      </div>
                      <span className="text-white/25">›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>
      </header>

      <main className="px-4 py-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="text-white/40 text-xs">
            {!q && !area ? t.searchParts : (
              <span className="flex items-center gap-2">
                {kcLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                {kcLoading ? t.loadingParts : `${kcData?.meta?.total ?? kcResults.length} ${t.foundParts}`}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs border border-white/10 rounded-lg px-2.5 py-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> {t.filters}
          </button>
        </div>

        {showFilters && (
          <div className="mb-4">
            <FilterPanel facets={facets} filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)} />
          </div>
        )}

        {!q && !area ? (
          <div className="space-y-6">
            <EmptyState q={q} onReset={onReset} />
          </div>
        ) : kcError ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-5 text-center">
            <p className="text-sm text-amber-200/80">{kcError}</p>
            <button onClick={onReset} className="mt-3 text-xs text-[#5a9cd9] hover:underline">{t.retry}</button>
          </div>
        ) : (
          <div className="space-y-6">
            {kcLoading ? (
              <IndustrialpediaLoader label={t.loadingParts} />
            ) : kcResults.length > 0 && (

              <section>
                <div className="text-[10px] uppercase tracking-wider text-[#47bcb6] mb-2">{area ? `${t.foundPartsLabel} · ${areaLabel}` : t.foundPartsLabel}</div>
                <div className="space-y-2.5">
                  {kcResults.map((r) => <ResultCard key={r.id} result={r} />)}
                </div>
              </section>
            )}

            {discoveryResults.length > 0 && (
              <section>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">{t.structuredSources}</div>
                <div className="space-y-2.5">
                  {discoveryResults.map((r) => <ResultCard key={r.id || r.discovery_id || r.part_number} result={r} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {(ficha || fichaLoading || fichaError) && (
        <FichaIndustrialpedia ficha={ficha} loading={fichaLoading} error={fichaError} onClose={() => { setFicha(null); setFichaError(null); }} />
      )}
    </div>
  );
}