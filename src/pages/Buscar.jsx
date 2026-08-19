import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Search, ArrowLeft, SlidersHorizontal, Loader2, Globe } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResultCard from '@/components/search/ResultCard';
import GoogleResultCard from '@/components/search/GoogleResultCard';
import FichaIndustrialpedia from '@/components/search/FichaIndustrialpedia';
import FilterPanel from '@/components/search/FilterPanel';
import EmptyState from '@/components/search/EmptyState';

const DEFAULT_FILTERS = { manufacturers: [], categories: [], has_specification: false, only_published: false };

export default function Buscar() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const [kcData, setKcData] = useState(null);
  const [kcLoading, setKcLoading] = useState(false);
  const [googleData, setGoogleData] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState(null);

  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionTimer = useRef(null);

  const [ficha, setFicha] = useState(null);
  const [fichaLoading, setFichaLoading] = useState(false);
  const [fichaError, setFichaError] = useState(null);

  const runKnowledgeCore = useCallback(async (query, f) => {
    setKcLoading(true);
    try {
      const validation_states = f.only_published === false ? ['published', 'validated', 'incomplete'] : ['published'];
      const res = await base44.functions.invoke('Buscar', {
        q: query,
        filters: { manufacturers: f.manufacturers, categories: f.categories, has_specification: f.has_specification, validation_states },
        limit: 25,
        skip_web_discovery: true
      });
      setKcData(res.data);
    } catch {
      setKcData(null);
    } finally {
      setKcLoading(false);
    }
  }, []);

  const runGoogle = useCallback(async (query) => {
    setGoogleLoading(true);
    setGoogleError(null);
    try {
      const res = await base44.functions.invoke('BuscarGoogle', { query });
      setGoogleData(res.data);
      if (res.data?.telemetry?.google_error) setGoogleError(res.data.telemetry.google_error);
    } catch (e) {
      setGoogleError(e.message || 'Error en el descubrimiento Google');
      setGoogleData(null);
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  useEffect(() => {
    setInput(q);
    if (q) {
      runKnowledgeCore(q, filters);
      runGoogle(q);
    } else {
      setKcData(null);
      setGoogleData(null);
    }
  }, [q, filters, runKnowledgeCore, runGoogle]);

  // Autocompletado con debounce: usa BuscarGoogle para descubrir productos mientras
  // el usuario escribe. No ejecuta una búsqueda Google por cada carácter.
  useEffect(() => {
    const term = input.trim();
    if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    if (term.length < 3 || term === q.trim()) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    suggestionTimer.current = setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const res = await base44.functions.invoke('BuscarGoogle', { query: term });
        const items = (res.data?.google_results || []).slice(0, 6).map((r) => ({
          title: r.product_name || r.title || 'Producto',
          partNumber: r.part_number || '',
          manufacturer: r.manufacturer_name || '',
          image: r.image_url || '',
          result: r
        }));
        setSuggestions(items);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 450);
    return () => suggestionTimer.current && clearTimeout(suggestionTimer.current);
  }, [input, q]);

  const submit = (e) => {
    e.preventDefault();
    const next = input.trim();
    if (next) {
      setSuggestions([]);
      setParams({ q: next });
    }
  };

  const onReset = () => {
    setFilters(DEFAULT_FILTERS);
    setInput('');
    navigate('/buscar');
  };

  const kcResults = kcData?.results || [];
  const facets = kcData?.facets || { manufacturers: [], categories: [] };
  const googleResults = googleData?.google_results || [];
  const googleTelemetry = googleData?.telemetry || {};
  const kcHits = googleData?.knowledge_core_hits || [];

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
            placeholder="Ej: DSNU-25-25-PPV-A, 6ES7214-1AG40-0XB0, cilindro Festo…"
            className="bg-transparent flex-1 text-sm text-white placeholder:text-white/30 outline-none py-1.5"
            autoFocus
          />
          <button type="submit" className="bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-sm font-semibold px-4 py-1.5 rounded-full transition-colors">
            Buscar
          </button>

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
            {!q ? 'Escribe una refacción industrial para buscarla.' : (
              <span className="flex items-center gap-2">
                {googleLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                {googleLoading ? 'Descubriendo en la web…' : `${googleResults.length} resultado(s) web · ${kcResults.length} en Knowledge Core`}
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

        {!q ? (
          <EmptyState q={q} onReset={onReset} />
        ) : (
          <div className="space-y-6">
            {/* Knowledge Core verificado */}
            {kcResults.length > 0 && (
              <section>
                <div className="text-[10px] uppercase tracking-wider text-[#47bcb6] mb-2">Verificado en Knowledge Core</div>
                <div className="space-y-3">
                  {kcResults.map((r) => <ResultCard key={r.id} result={r} />)}
                </div>
              </section>
            )}

            {/* Descubrimiento web */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Descubrimiento web</div>
                {googleTelemetry.queries_made ? <span className="text-[10px] text-white/30">{googleTelemetry.queries_made} consulta(s) API</span> : null}
              </div>

              {googleLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-white/40 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" /> Buscando en la web…
                </div>
              ) : googleError && googleResults.length === 0 ? (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                  <div className="text-sm text-amber-300/90 font-medium mb-1">El buscador web no respondió</div>
                  <div className="text-xs text-white/50">Error técnico: {googleError}</div>
                  {googleTelemetry.google_detail ? <div className="text-[11px] text-white/35 mt-2 break-words">Detalle Google: {googleTelemetry.google_detail}</div> : null}
                  <div className="text-[11px] text-white/35 mt-1">El detalle anterior es la respuesta técnica del proveedor; no muestra la API key.</div>
                </div>
              ) : googleResults.length === 0 ? (
                <div className="text-center py-8 text-white/40 text-xs">No se encontraron fuentes industriales para esta referencia.</div>
              ) : (
                <div className="space-y-3">
                  {googleResults.map((r, i) => (
                    <GoogleResultCard key={`${r.url}-${i}`} result={r} query={q} onFicha={(f) => { setFicha(f); setFichaError(null); }} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {(ficha || fichaLoading || fichaError) && (
        <FichaIndustrialpedia ficha={ficha} loading={fichaLoading} error={fichaError} onClose={() => { setFicha(null); setFichaError(null); }} />
      )}
    </div>
  );
}