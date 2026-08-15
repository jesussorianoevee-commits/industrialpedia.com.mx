import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Search, ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResultCard from '@/components/search/ResultCard';
import FilterPanel from '@/components/search/FilterPanel';
import EmptyState from '@/components/search/EmptyState';

const DEFAULT_FILTERS = { manufacturers: [], categories: [], has_specification: false, only_published: true };

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

  const submit = (e) => {
    e.preventDefault();
    const next = input.trim();
    if (next) setParams({ q: next });
  };

  const onReset = () => {
    setFilters(DEFAULT_FILTERS);
    setInput('');
    navigate('/buscar');
  };

  const facets = data?.facets || { manufacturers: [], categories: [] };
  const results = data?.results || [];

  return (
    <div className="min-h-screen bg-[#0a0e12] grid-bg">
      <header className="sticky top-0 z-30 bg-[#0a0e12]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <form onSubmit={submit} className="mx-auto max-w-2xl flex items-center gap-2 bg-[#161a20] border border-white/10 rounded-full pl-3 pr-1.5 py-1">
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
          <EmptyState q={q} onReset={onReset} />
        ) : (
          <div className="space-y-3">
            {results.map((r) => (
              <ResultCard key={r.id} result={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}