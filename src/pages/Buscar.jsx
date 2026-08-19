import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Search, ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResultCard from '@/components/search/ResultCard';
import FilterPanel from '@/components/search/FilterPanel';
import EmptyState from '@/components/search/EmptyState';

// BUSCAR inicia en modo descubrimiento: muestra published/validated/incomplete.
// El estado de confianza siempre se muestra en cada resultado; rejected queda fuera.
const DEFAULT_FILTERS = { manufacturers: [], categories: [], has_specification: false, only_published: false };

export default function Buscar() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionTimer = useRef(null);

  const runSearch = useCallback(async (query, f) => {
    setLoading(true);
    setError(null);
    try {
      const validation_states = f.only_published === false ? ['published', 'validated', 'incomplete'] : ['published'];
      const payload = {
        q: query,
        filters: { manufacturers: f.manufacturers, categories: f.categories, has_specification: f.has_specification, validation_states },
        limit: 25
      };
      const res = await base44.functions.invoke('Buscar', payload);
      setData(res.data);
    } catch (e) {
      setError(e.message || 'Error en la búsqueda');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setInput(q);
    runSearch(q, filters);
  }, [q, filters, runSearch]);

  // Autocompletado tipo fabricante: no espera al botón Buscar. Cada término
  // escrito consulta el mismo motor determinístico y muestra productos/PNs
  // conocidos antes de ejecutar la búsqueda completa.
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
        const validation_states = ['published', 'validated', 'incomplete'];
        const res = await base44.functions.invoke('Buscar', {
          q: term,
          filters: { manufacturers: [], categories: [], has_specification: false, validation_states },
          limit: 8,
          autocomplete: true
        });
        const items = (res.data?.results || []).slice(0, 8).map((r) => ({
          id: r.id,
          title: r.name || r.title || r.part_number || r.candidate_part_number || 'Producto',
          partNumber: r.part_number || r.candidate_part_number || '',
          manufacturer: r.manufacturer_name || r.manufacturer || '',
          image: r.image_url || r.image || '',
          result: r
        }));
        setSuggestions(items);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 280);
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

  const facets = data?.facets || { manufacturers: [], categories: [] };
  const results = data?.results || [];
  const webResults = data?.web_results || [];
  const webDiscovery = data?.web_discovery || null;

  // Google Programmable Search: usa el motor industrial configurado por el usuario
  // como capa de descubrimiento web, sin IA. Solo se muestra cuando Knowledge Core
  // no tiene resultados internos; la ficha Industrialpedia sigue dependiendo de
  // una fuente aceptada y evidencia real.
  useEffect(() => {
    if (!q) return;

    const scriptId = 'industrialpedia-google-cse';
    const gname = 'industrialpedia-cse';
    const containerId = 'industrialpedia-cse-results';

    // Google recomienda configurar __gcse ANTES de cargar cse.js cuando se usa
    // renderización explícita. Esto evita la carrera que dejaba el panel vacío.
    const render = () => {
      const api = window.google?.search?.cse?.element;
      const container = document.getElementById(containerId);
      if (!api || !container) return false;
      try {
        // Evita duplicar el elemento cuando React remonta la página o cambia q.
        container.innerHTML = '';
        api.render({
          div: containerId,
          tag: 'searchresults-only',
          gname,
          attributes: {
            webSearchResultSetSize: 'large',
            safeSearch: 'active',
            linkTarget: '_blank'
          }
        });
        const element = api.getElement?.(gname);
        if (!element) return false;
        element.execute(String(q));
        return true;
      } catch (e) {
        console.warn('Industrialpedia Google CSE render:', e);
        return false;
      }
    };

    const existingScript = document.getElementById(scriptId);
    if (!existingScript) {
      window.__gcse = {
        ...(window.__gcse || {}),
        parsetags: 'explicit',
        initializationCallback: () => {
          // En el callback de inicialización el objeto de Google ya está listo;
          // es el punto recomendado por Google para llamar a render().
          render();
        }
      };
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = 'https://cse.google.com/cse.js?cx=2725a736ccf564979';
      document.head.appendChild(script);
    } else {
      // Si el script ya existe, el callback de inicialización ya ocurrió.
      // Renderizamos explícitamente el elemento de esta consulta.
      let attempts = 0;
      const retry = () => {
        if (render() || ++attempts >= 20) return;
        setTimeout(retry, 150);
      };
      retry();
    }

    return () => {
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = '';
    };
  }, [q]);

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
            placeholder="Ej: Siemens, Festo, SKF, Fanuc, ABC-123..."
            className="bg-transparent flex-1 text-sm text-white placeholder:text-white/30 outline-none py-1.5"
            autoFocus
          />
          <button type="submit" className="bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-sm font-semibold px-4 py-1.5 rounded-full transition-colors">
            Buscar
          </button>

          {input.trim().length >= 2 && input.trim() !== q.trim() && (suggestionsLoading || suggestions.length > 0) && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#11161c] shadow-2xl">
              {suggestionsLoading ? (
                <div className="px-4 py-4 text-xs text-white/40">Buscando productos…</div>
              ) : (
                <div className="max-h-[430px] overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.id || `${s.manufacturer}-${s.partNumber}-${s.title}`}
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
      </header>

      <main className="px-4 py-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="text-white/40 text-xs">
            {loading ? 'Buscando en el Knowledge Core…' : q ? `${data?.total ?? 0} resultado(s) para "${q}"` : 'Escribe un término para buscar en el Knowledge Core.'}
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
            <FilterPanel
              facets={facets}
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(DEFAULT_FILTERS)}
            />
          </div>
        )}

        {error ? (
          <div className="text-center py-10 text-white/50 text-sm">{error}</div>
        ) : loading ? (
          <div className="text-white/40 text-sm">Cargando…</div>
        ) : results.length === 0 ? (
          <>
            <EmptyState q={q} onReset={onReset} />
            {q && (
              <section className="mt-6 rounded-2xl border border-white/10 bg-[#11161c] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Descubrimiento web</div>
                    <div className="text-xs text-white/40 mt-0.5">Resultados del buscador industrial configurado</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-white/35">Google</span>
                </div>
                <div id="industrialpedia-cse-results" className="min-h-[120px] rounded-xl bg-white/[0.02] p-2 overflow-hidden" />
                {webResults.length > 0 && <div className="space-y-2 mt-3">{webResults.map((w, i) => <a key={`${w.url}-${i}`} href={w.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="text-sm font-medium text-white">{w.title || w.url}</div><div className="mt-1 text-xs text-white/45">{w.snippet || 'Fuente encontrada por Google.'}</div><div className="mt-2 text-[10px] uppercase tracking-wider text-white/35">{w.source_type === 'official' ? 'Fuente oficial' : w.source_type === 'distributor' ? 'Distribuidor' : 'Fuente CSE configurada'} · Google</div></a>)}</div>
                {webResults.length === 0 && webDiscovery?.google_error && <div className="mt-2 text-xs text-amber-300/70">API Google: {webDiscovery.google_error}</div>}
              </section>
            )}
          </>
        ) : (
          <>
            <div className="space-y-3">
              {results.map((r) => (
                <ResultCard key={r.id} result={r} />
              ))}
            </div>
            {q && (
              <section className="mt-6 rounded-2xl border border-white/10 bg-[#11161c] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Descubrimiento web</div>
                    <div className="text-xs text-white/40 mt-0.5">Resultados del buscador industrial configurado</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-white/35">Google</span>
                </div>
                <div id="industrialpedia-cse-results" className="min-h-[120px] rounded-xl bg-white/[0.02] p-2 overflow-hidden" />
                {webResults.length > 0 && <div className="space-y-2 mt-3">{webResults.map((w, i) => <a key={`${w.url}-${i}`} href={w.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="text-sm font-medium text-white">{w.title || w.url}</div><div className="mt-1 text-xs text-white/45">{w.snippet || 'Fuente encontrada por Google.'}</div><div className="mt-2 text-[10px] uppercase tracking-wider text-white/35">{w.source_type === 'official' ? 'Fuente oficial' : w.source_type === 'distributor' ? 'Distribuidor' : 'Fuente CSE configurada'} · Google</div></a>)}</div>
                {webResults.length === 0 && webDiscovery?.google_error && <div className="mt-2 text-xs text-amber-300/70">API Google: {webDiscovery.google_error}</div>}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}