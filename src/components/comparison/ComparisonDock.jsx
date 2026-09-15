import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, GitCompareArrows, Trash2 } from 'lucide-react';
import { useComparisonSelection } from '@/lib/comparisonSelection';
import { compareSelectedParts } from '../../../base44/shared/supabaseIndustrialpediaApi.js';

const RING_BY_STATE = {
  compatible: 'ring-2 ring-[#16c79a]',
  review: 'ring-2 ring-amber-400',
  not_compatible: 'ring-2 ring-red-400',
  insufficient: 'ring-2 ring-white/15'
};

export default function ComparisonDock() {
  const { selected, count, remove, clear, maxSelection } = useComparisonSelection();
  const navigate = useNavigate();
  const [states, setStates] = useState({});
  const idsKey = selected.map((p) => p.id).join(',');

  // Colorea los aros de las miniaturas reutilizando la misma matriz técnica
  // que alimenta la tabla de comparación completa -- sin duplicar un motor
  // de comparación "ligero" aparte solo para la bandeja.
  useEffect(() => {
    let cancelled = false;
    if (count < 2) { setStates({}); return undefined; }
    (async () => {
      try {
        const result = await compareSelectedParts(selected.map((p) => p.id));
        if (cancelled) return;
        const next = {};
        (result.alternatives || []).forEach((alt) => { next[alt.id] = alt.comparison?.state; });
        setStates(next);
      } catch {
        if (!cancelled) setStates({});
      }
    })();
    return () => { cancelled = true; };
    // idsKey ya resume la lista de ids; count decide si vale la pena consultar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, count]);

  if (count === 0) return null;

  return (
    <div className="ip-dock-enter fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="ip-card mx-auto flex max-w-2xl items-center gap-2 sm:gap-3 rounded-2xl border border-white/10 bg-[#0c1117]/95 p-2.5 sm:p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          {selected.map((p, i) => {
            const ring = i === 0 ? 'ring-2 ring-primary' : (RING_BY_STATE[states[p.id]] || 'ring-2 ring-white/15');
            return (
              <div key={p.id} className="group relative shrink-0">
                <div className={`flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white transition-shadow ${ring}`}>
                  {p.image_url
                    ? <img src={p.image_url} alt={p.part_number} className="h-full w-full object-contain p-1" referrerPolicy="no-referrer" />
                    : <span className="text-[8px] font-mono text-black/40 px-0.5 text-center leading-none">{(p.part_number || '?').slice(0, 5)}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`Quitar ${p.part_number || 'pieza'} de la comparación`}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus:outline-none"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          {Array.from({ length: Math.max(0, maxSelection - count) }).map((_, i) => (
            <div key={`empty-${i}`} className="hidden sm:block h-12 w-12 shrink-0 rounded-full border border-dashed border-white/10" aria-hidden="true" />
          ))}
        </div>
        <div className="hidden sm:block min-w-0 flex-1 text-[11px] text-white/45">{count}/{maxSelection} seleccionadas</div>
        <button type="button" onClick={clear} className="shrink-0 rounded-lg p-2 text-white/40 transition-colors hover:text-white/70" aria-label="Vaciar selección" title="Vaciar selección">
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={count < 2}
          onClick={() => navigate('/comparar-seleccion')}
          className="ip-button-primary inline-flex shrink-0 items-center gap-1.5 disabled:opacity-40"
        >
          <GitCompareArrows className="h-3.5 w-3.5" /> Comparar ({count})
        </button>
      </div>
    </div>
  );
}
