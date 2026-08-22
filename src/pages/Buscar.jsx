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
  const { language } = useLanguage();

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
            placeholder="Ej: DSNU-25-25-PPV-A, 6ES7214-1AG40-0XB0, cilindro Festo…"
            className="bg-transparent flex-1 text-sm text-white placeholder:text-white/30 outline-none py-1.5"
            autoFocus
          />
          <button type="submit" className="bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-sm font-semibold px-4 py-1.5 rounded-full transition-colors">
            Buscar
          </button>

          {showHistory && history.length > 0 && input.trim().length < 3 && !(input.trim() !== q.trim() && suggestions.length > 0) && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#11161c] shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
                  <Clock className="w-3 h-3" /> Búsquedas recientes
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setHistory([]); try { localStorage.removeItem('industrialpedia_search_history'); } catch {} }}
                  className="text-[10px] text-white/30 hover:text-white/60"
                >
                  Limpiar
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
                <div className="px-4 py-4 text-xs text-white/40 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Descubriendo productos…</div>
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
            {!q && !area ? 'Escribe una refacción industrial para buscarla.' : (
              <span className="flex items-center gap-2">
                {kcLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                {kcLoading ? 'Cargando refacciones…' : `${kcData?.meta?.total ?? kcResults.length} refacciones`}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs border border-white/10 rounded-lg px-2.5 py-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros
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
            <button onClick={onReset} className="mt-3 text-xs text-[#5a9cd9] hover:underline">Reintentar</button>
          </div>
        ) : (
          <div className="space-y-6">
            {kcLoading ? (
              <div className="flex flex-col items-center justify-center py-8 min-h-[360px]">
                <div className="relative w-56 h-56 flex items-center justify-center rounded-3xl bg-black/20 border border-white/10 shadow-2xl overflow-hidden">
                  <img
                    src="data:image/webp;base64,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"
                    alt="Industrialpedia"
                    className="w-48 h-48 object-contain animate-pulse"
                  />
                  <div className="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-[#0b1118]/95 border border-[#5a9cd9]/50 flex items-center justify-center shadow-lg">
                    <Cog className="w-9 h-9 animate-spin text-[#5a9cd9]" />
                  </div>
                </div>
                <span className="mt-4 text-sm text-white/55">Cargando refacciones…</span>
              </div>
            ) : kcResults.length > 0 && (
              <section>
                <div className="text-[10px] uppercase tracking-wider text-[#47bcb6] mb-2">{area ? `Refacciones · ${areaLabel}` : 'Refacciones encontradas'}</div>
                <div className="space-y-3">
                  {kcResults.map((r) => <ResultCard key={r.id} result={r} />)}
                </div>
              </section>
            )}

            {discoveryResults.length > 0 && (
              <section>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Fuentes estructuradas</div>
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