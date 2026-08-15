import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Search, ArrowLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function Buscar() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(q);
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const parts = await base44.entities.Part.list('-updated_date', 1000);
        const needle = q.toLowerCase();
        const filtered = parts.filter((p) =>
          (p.part_number || '').toLowerCase().includes(needle) ||
          (p.manufacturer_name || '').toLowerCase().includes(needle) ||
          (p.description || '').toLowerCase().includes(needle)
        );
        setResults(filtered);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [q]);

  const submit = (e) => {
    e.preventDefault();
    if (input.trim()) navigate(`/buscar?q=${encodeURIComponent(input.trim())}`);
  };

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
            placeholder="Ej: Siemens, Festo, SKF, Fanuc..."
            className="bg-transparent flex-1 text-sm text-white placeholder:text-white/30 outline-none py-1.5"
            autoFocus
          />
          <button type="submit" className="bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-sm font-semibold px-4 py-1.5 rounded-full transition-colors">
            Buscar
          </button>
        </form>
      </header>
      <main className="px-5 py-6 max-w-2xl mx-auto">
        <div className="text-white/40 text-xs mb-4">
          {loading ? 'Buscando…' : q ? `${results.length} resultado(s) para "${q}"` : 'Escribe un término para buscar en el Knowledge Core.'}
        </div>
        {loading ? (
          <div className="text-white/40 text-sm">Cargando…</div>
        ) : results.length === 0 ? (
          q ? (
            <div className="text-center py-16">
              <p className="text-white/50 text-sm mb-2">Sin resultados todavía.</p>
              <p className="text-white/30 text-xs max-w-xs mx-auto leading-relaxed">
                El Knowledge Core aún no contiene refacciones publicadas para este término. Cuando se ingiera y valide documentación, los resultados aparecerán aquí con su fuente y evidencia.
              </p>
            </div>
          ) : null
        ) : (
          <div className="space-y-3">
            {results.map((p) => (
              <div key={p.id} className="bg-[#161a20] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-white font-semibold text-sm">{p.part_number}</div>
                    <div className="text-white/50 text-xs">{p.manufacturer_name}</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/50 capitalize">
                    {p.validation_state}
                  </span>
                </div>
                {p.description && <p className="text-white/45 text-xs mt-2">{p.description}</p>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}