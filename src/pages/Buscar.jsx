import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Search, ArrowLeft, SlidersHorizontal, Loader2, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResultCard from '@/components/search/ResultCard';
import FichaIndustrialpedia from '@/components/search/FichaIndustrialpedia';
import FilterPanel from '@/components/search/FilterPanel';
import EmptyState from '@/components/search/EmptyState';
import { AREAS } from '@/lib/taxonomy';
import { getIndustrialpediaAreaParts } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { translateParts, useLanguage } from '@/lib/i18n';
import IndustrialpediaLoader from '@/components/ui/IndustrialpediaLoader';
import { consumeTrialAction } from '@/lib/trial';
import { useAuth } from '@/lib/AuthContext';

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
  const { isAuthenticated } = useAuth();
  const [trialNotice, setTrialNotice] = useState(null);

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

  // Reinicio único del historial heredado: empezamos limpio desde esta versión.
  // Después del reset, el historial vuelve a guardar normalmente las búsquedas
  // nuevas del usuario y no se vuelve a borrar en futuras sesiones.
  const SEARCH_HISTORY_VERSION = '2';
  const [history, setHistory] = useState(() => {
    try {
      if (localStorage.getItem('industrialpedia_search_history_version') !== SEARCH_HISTORY_VERSION) {
        localStorage.removeItem('industrialpedia_search_history');
        localStorage.setItem('industrialpedia_search_history_version', SEARCH_HISTORY_VERSION);
        return [];
      }
      const stored = JSON.parse(localStorage.getItem('industrialpedia_search_history') || '[]');
      return Array.isArray(stored)
        ? stored.filter((item) => typeof item === 'string' && item.trim()).slice(0, 8)
        : [];
    } catch { return []; }
  });

  const saveToHistory = (term) => {
    const clean = term.trim();
    if (!clean) return;
    setHistory((prev) => {
      const normalized = clean.toLocaleLowerCase();
      const next = [clean, ...prev.filter((s) => s.trim().toLocaleLowerCase() !== normalized)].slice(0, 8);
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
      let res;
      try {
        // La consulta por familia es independiente de BUSCAR. La primera lectura
        // usa una página moderada; si Supabase devuelve statement_timeout por carga
        // concurrente, reintentamos con una página menor en vez de mostrar un error
        // al usuario. No cambiamos la fuente ni la lógica de clasificación.
        res = await getIndustrialpediaAreaParts(areaKey, 25, 0);
      } catch (firstError) {
        const message = String(firstError?.message || firstError || '').toLowerCase();
        if (!message.includes('statement timeout') && !message.includes('canceling statement')) throw firstError;
        res = await getIndustrialpediaAreaParts(areaKey, 10, 0);
      }
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

  // Autocompletado determinístico: consulta únicamente el Knowledge Core interno
  // y fabricantes registrados. Nunca mezcla DiscoveryIndex ni Tavily/Google.
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
    if (!next) return;
    if (!isAuthenticated) {
      const trial = consumeTrialAction();
      if (!trial.allowed) {
        setTrialNotice('limit');
        return;
      }
      setTrialNotice(trial.remaining === 1 ? 'last' : null);
    }
    saveToHistory(next);
    setSuggestions([]);
    setParams({ q: next });
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
      <header className="sticky top-0 z-30 bg-[#0a0e12]/92 backdrop-blur-xl border-b border-white/[0.07] shadow-[0_12px_35px_-28px_rgba(0,0,0,.8)] px-3 sm:px-5 py-3 ip-mobile-safe-top">
        <form onSubmit={submit} className="relative mx-auto max-w-3xl flex items-center gap-2 bg-[#161a20] border border-white/10 rounded-2xl pl-2.5 sm:pl-3 pr-1.5 py-1.5 shadow-[0_16px_40px_-30px_rgba(0,0,0,.9)] focus-within:border-[#5a9cd9]/60 focus-within:ring-4 focus-within:ring-[#5a9cd9]/10 transition-all">
          <Link to="/" className="text-white/50 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="w-8 h-8 rounded-xl bg-[#5a9cd9]/10 border border-[#5a9cd9]/10 flex items-center justify-center shrink-0"><Search className="w-4 h-4 text-[#5a9cd9]" /></span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setShowHistory(true)}
            placeholder={t.searchPlaceholder}
            className="bg-transparent flex-1 text-sm text-white placeholder:text-white/30 outline-none py-2.5 min-w-0"
          />
          <button type="submit" className="bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-xs sm:text-sm font-semibold px-3.5 sm:px-5 py-2.5 rounded-xl transition-colors shrink-0">
            {t.search}
          </button>

          {showHistory && history.length > 0 && input.trim().length === 0 && (
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

          {input.trim().length >= 2 && input.trim() !== q.trim() && (suggestionsLoading || suggestions.length > 0) && (
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
                        saveToHistory(input.trim());
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
                          <Search className="w-4 h-4 text-white/30" />
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
        {trialNotice === 'last' && (
          <div className="mx-auto mt-2 max-w-2xl px-2 text-center text-xs text-[#65a9e6]">Te queda 1 prueba gratuita.</div>
        )}
        {trialNotice === 'limit' && (
          <div className="mx-auto mt-3 max-w-md rounded-xl border border-white/10 bg-[#11161c] p-4 text-center shadow-xl">
            <div className="font-semibold text-white">¿Deseas probar más?</div>
            <div className="mt-1 text-sm text-white/50">Regístrate :)</div>
            <button type="button" onClick={() => navigate(`/login?returnTo=${encodeURIComponent('/buscar')}`)} className="mt-4 w-full rounded-lg bg-[#65a9e6] px-4 py-2.5 text-sm font-semibold text-[#080d12]">Registrarme gratis</button>
          </div>
        )}
      </header>

      <main className="px-3 sm:px-5 py-6 sm:py-8 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between gap-2 mb-5 sm:mb-6 pb-4 border-b border-white/[0.06]">
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
            className="flex items-center gap-1.5 text-white/60 hover:text-white hover:border-[#5a9cd9]/35 hover:bg-white/[0.025] text-xs border border-white/10 rounded-xl px-3 py-2 transition-colors"
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
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5 sm:p-6 text-center">
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
                <div className="space-y-3">
                  {kcResults.map((r) => <ResultCard key={r.id} result={r} />)}
                </div>
              </section>
            )}

            {discoveryResults.length > 0 && (
              <section>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">{t.structuredSources}</div>
                <div className="space-y-3">
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