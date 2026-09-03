import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getUseCasesIndustrialpedia, browseByFamilyIndustrialpedia } from '../../../base44/shared/supabaseIndustrialpediaApi.js';
import ResultCard from '@/components/search/ResultCard';

// Navegacion "empieza por lo que necesitas", validada con la investigacion de
// comparadores (RoboDK: metricas/criterios fijos por categoria; RoboMercato:
// navegacion por caso de uso). A diferencia del "Solution Finder" de
// RoboMercato (impulsado por IA), esto es un filtro deterministico: la tabla
// use_cases mapea caso -> family_code de forma fija, curada a mano, y solo
// para familias que ya tienen piezas reales publicadas.
export default function UseCasesSection() {
  const [useCases, setUseCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [results, setResults] = useState({});
  const [resultsLoading, setResultsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getUseCasesIndustrialpedia();
        if (!cancelled) setUseCases(data);
      } catch {
        if (!cancelled) setUseCases([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async (useCase) => {
    const code = useCase.use_case_code;
    if (expanded === code) {
      setExpanded(null);
      return;
    }
    setExpanded(code);
    if (!results[code]) {
      setResultsLoading(true);
      try {
        const family = useCase.family_codes?.[0];
        const parts = family ? await browseByFamilyIndustrialpedia(family, 6) : [];
        setResults((prev) => ({ ...prev, [code]: parts }));
      } catch {
        setResults((prev) => ({ ...prev, [code]: [] }));
      } finally {
        setResultsLoading(false);
      }
    }
  };

  if (loading || useCases.length === 0) return null;

  return (
    <section className="px-3 sm:px-5 py-6 sm:py-8 max-w-5xl mx-auto w-full">
      <div className="rounded-[24px] border border-border/70 bg-secondary/[0.18] px-4 sm:px-6 py-5 sm:py-6">
        <h2 className="ip-text font-bold text-xl sm:text-2xl tracking-[-0.025em]">Empieza por lo que necesitas</h2>
        <p className="ip-muted text-[11px] sm:text-xs mt-1.5 mb-5">
          Piezas reales y verificadas, agrupadas por lo que estás resolviendo — no una recomendación automática, un filtro directo.
        </p>
        <div className="flex flex-col gap-2.5">
          {useCases.map((uc) => (
            <div key={uc.use_case_code} className="rounded-xl border border-border/60 overflow-hidden">
              <button
                type="button"
                onClick={() => handleToggle(uc)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-secondary/20 transition-colors"
                aria-expanded={expanded === uc.use_case_code}
              >
                <div className="min-w-0">
                  <div className="ip-text font-semibold text-sm">{uc.label_es}</div>
                  {uc.description_es && <div className="ip-muted text-[11px] mt-0.5 line-clamp-1">{uc.description_es}</div>}
                </div>
                {expanded === uc.use_case_code ? <ChevronUp className="h-4 w-4 shrink-0 ip-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 ip-muted" />}
              </button>
              {expanded === uc.use_case_code && (
                <div className="px-3 pb-3 pt-1 border-t border-border/40">
                  {resultsLoading && !results[uc.use_case_code] ? (
                    <div className="flex items-center justify-center py-6 ip-muted text-xs gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando piezas reales…
                    </div>
                  ) : (results[uc.use_case_code] || []).length === 0 ? (
                    <p className="ip-muted text-xs py-4 text-center">Sin piezas publicadas todavía para esta categoría.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                      {results[uc.use_case_code].map((r) => <ResultCard key={r.id} result={r} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
