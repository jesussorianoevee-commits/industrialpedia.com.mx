import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldCheck, AlertTriangle, XCircle, CheckCircle2, X } from 'lucide-react';
import { compareIndustrialpedia } from '../../base44/shared/supabaseIndustrialpediaApi.js';

const STATE = {
  compatible: { label: 'COMPATIBLE', short: 'Compatible', cls: 'border-[#16c79a]/60 bg-[#16c79a]/[0.08] text-[#16c79a]', icon: ShieldCheck },
  review: { label: 'SIMILAR', short: 'Revisión técnica', cls: 'border-amber-400/60 bg-amber-400/[0.08] text-amber-300', icon: AlertTriangle },
  insufficient: { label: 'DATOS INSUFICIENTES', short: 'Datos insuficientes', cls: 'border-white/20 bg-white/[0.03] text-white/45', icon: XCircle }
};

function val(s) { return `${s?.normalized_value || s?.original_value || ''}${s?.normalized_unit || s?.original_unit ? ` ${s.normalized_unit || s.original_unit}` : ''}`.trim() || 'No disponible'; }
function canonical(s) { return String(s?.attribute_canonical || s?.attribute_name || s?.attribute || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function stateFor(base, alt) {
  const differences = Array.isArray(alt?.comparison?.differences) ? alt.comparison.differences : [];
  const hit = differences.find((d) => canonical(d) === canonical(base));
  return hit?.state || 'equal';
}
function valueFor(base, alt) {
  const differences = Array.isArray(alt?.comparison?.differences) ? alt.comparison.differences : [];
  const hit = differences.find((d) => canonical(d) === canonical(base));
  if (hit && Object.prototype.hasOwnProperty.call(hit, 'candidate')) return hit.candidate;
  return (alt?.specs || []).find((s) => canonical(s) === canonical(base));
}
function statusMeta(component) {
  return STATE[component?.comparison?.state] || STATE.insufficient;
}

function StatusBadge({ component, base = false }) {
  if (base) return <span className="inline-flex items-center gap-1.5 rounded-md border border-[#16c79a]/35 bg-[#16c79a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#16c79a]"><CheckCircle2 className="h-3.5 w-3.5" /> Componente base</span>;
  const meta = statusMeta(component);
  const Icon = meta.icon;
  const compared = component?.comparison?.compared || 0;
  const equal = component?.comparison?.equal || 0;
  return <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${meta.cls}`}>
    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"><Icon className="h-3.5 w-3.5" />{meta.label}</span>
    <span className="text-[10px] font-mono font-semibold">{equal}/{compared} SPECS</span>
  </div>;
}

export default function Comparar() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const partNumberHint = searchParams.get('pn') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const result = await compareIndustrialpedia(id, partNumberHint, 3);
        setData(result);
      } catch (e) { setError(e?.message || 'No se pudo ejecutar el comparador.'); }
    })();
  }, [id, partNumberHint]);

  if (!data && !error) return <div className="min-h-screen bg-[#080d12] flex items-center justify-center text-white/45 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" />Buscando alternativas compatibles…</div>;
  if (error) return <div className="min-h-screen bg-[#080d12] flex flex-col items-center justify-center gap-3 text-white/50 text-sm"><p>{error}</p><button type="button" onClick={() => window.history.back()} className="text-[#65a9e6]">← Volver a ficha</button></div>;

  const base = data.base;
  const alternatives = data.alternatives || [];
  const notEvaluable = data.compatibility_evaluable === false || data.decision?.state === 'not_evaluable';
  const cols = [base, ...alternatives];
  const specCount = base.specs?.length || 0;

  return <div className="min-h-screen bg-[#080d12] text-white">
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#080d12]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3">
        <button type="button" onClick={() => window.history.back()} className="rounded-lg border border-white/10 p-2 text-white/60 hover:text-white" aria-label="Volver"><ArrowLeft className="h-4 w-4" /></button>
        <div className="font-mono text-sm tracking-[0.18em]"><span className="font-semibold text-white">INDUSTRIAL</span><span className="text-[#168fd5]">PEDIA</span></div>
        <div className="hidden md:flex items-center gap-6 ml-6 text-xs text-white/45"><span>Buscar</span><span className="rounded-full bg-[#102333] px-4 py-2 text-[#65a9e6]">Comparar</span><span>Fabricantes</span><span>Recursos</span></div>
        <div className="ml-auto flex items-center gap-2"><span className="hidden sm:inline rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55">ES</span><span className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55">◐</span></div>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-4 py-5 sm:py-7">
      <button type="button" onClick={() => window.history.back()} className="mb-4 flex items-center gap-2 text-xs text-[#65a9e6] hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Volver a ficha</button>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">Comparación técnica</h1><p className="mt-1 text-sm text-white/45">Compara especificaciones técnicas y encuentra alternativas compatibles.</p></div>
        <div className="hidden sm:block rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono text-white/35">{data.candidates_considered || 0} candidatos consultados</div>
      </div>

      <section className="mb-5 overflow-hidden rounded-xl border border-white/10 bg-[#0d141b]">
        <div className="grid gap-5 p-5 md:grid-cols-[150px_1fr_1fr] md:items-center">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-[#091016]">
            {base.image_url ? <img src={base.image_url} alt="" className="h-full w-full object-contain p-3" referrerPolicy="no-referrer" /> : <div className="text-[10px] text-white/25">Sin imagen</div>}
          </div>
          <div>
            <StatusBadge component={base} base />
            <div className="mt-3 font-mono text-xl font-semibold text-white">{base.part_number}</div>
            <div className="mt-1 text-sm text-[#65a9e6]">{base.manufacturer_name || 'Fabricante no indicado'}</div>
            <div className="mt-2 max-w-xl text-sm text-white/55">{base.product_name || base.description || ''}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            {(base.specs || []).slice(0, 6).map((s, i) => <div key={i}><div className="text-white/30">{s.attribute_name || s.attribute}</div><div className="mt-0.5 font-mono text-white/80">{val(s)}</div></div>)}
          </div>
        </div>
      </section>

      {notEvaluable ? <section className="rounded-xl border border-amber-300/15 bg-amber-300/[0.025] p-5 text-sm text-white/55"><div className="font-semibold text-amber-200/85">Compatibilidad no evaluable</div><p className="mt-2 text-xs leading-relaxed">La ficha base no tiene especificaciones verificadas suficientes en Knowledge Core.</p></section> : <>
        <section className="mb-4 grid gap-3 md:grid-cols-3">
          {alternatives.map((c, i) => {
            const meta = statusMeta(c); const equal = c.comparison?.equal || 0; const compared = c.comparison?.compared || 0;
            return <div key={i} className={`rounded-xl border p-4 ${meta.cls}`}>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider">{meta.label}</span><span className="font-mono text-[10px] font-semibold">{equal}/{compared} SPECS</span></div>
              <div className="mt-3 text-xs text-white/50">Compatibilidad</div>
              <div className="mt-1 text-sm font-semibold text-white/80">{meta.short}</div>
            </div>;
          })}
        </section>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d141b] shadow-2xl shadow-black/20">
          <div className="min-w-[820px]">
            <div className="grid" style={{gridTemplateColumns:`170px repeat(${cols.length}, minmax(210px, 1fr))`}}>
              <div className="p-4 text-[10px] uppercase tracking-wider text-white/30">Especificación</div>
              {cols.map((c, i) => <div key={i} className="border-l border-white/[0.08] p-4">
                <div className="flex items-start gap-3">
                  {c.image_url && <img src={c.image_url} alt="" className="h-12 w-12 shrink-0 rounded-md object-contain bg-white p-1" referrerPolicy="no-referrer" />}
                  <div className="min-w-0"><div className="font-mono text-sm font-semibold text-[#65a9e6] break-all">{c.part_number}</div><div className="mt-1 text-[10px] text-white/40">{c.manufacturer_name || 'Fabricante no indicado'}</div><div className="mt-1 line-clamp-2 text-xs text-white/55">{c.product_name || c.description || ''}</div></div>
                </div>
              </div>)}
            </div>

            {(base.specs || []).map((s, idx) => <div key={`${s.attribute_name}-${idx}`} className="grid" style={{gridTemplateColumns:`170px repeat(${cols.length}, minmax(210px, 1fr))`}}>
              <div className="border-t border-white/[0.06] p-3 text-xs text-white/55">{s.attribute_name || s.attribute}</div>
              {cols.map((c, ci) => {
                const candidate = ci === 0 ? s : valueFor(s, c);
                const st = ci === 0 ? 'base' : stateFor(s, c);
                return <div key={ci} className={`flex items-center justify-between gap-2 border-l border-t border-white/[0.06] p-3 text-xs ${st === 'equal' ? 'text-white/80' : st === 'different' ? 'text-red-300' : 'text-white/30'}`}>
                  <span className="font-mono leading-relaxed">{candidate ? (typeof candidate === 'object' ? val(candidate) : String(candidate)) : 'No disponible'}</span>
                  {ci > 0 && (st === 'equal' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16c79a]" /> : st === 'different' ? <X className="h-4 w-4 shrink-0 text-red-400" /> : <span className="text-white/20">—</span>)}
                </div>;
              })}
            </div>)}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[10px] text-white/45">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[#16c79a]" /> Igual</span>
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-300" /> Diferente (revisar)</span>
          <span className="flex items-center gap-1.5"><X className="h-3.5 w-3.5 text-red-400" /> No coincide</span>
          <span className="flex items-center gap-1.5"><span className="text-white/30">○</span> No especificado</span>
        </div>
        <p className="mt-3 text-[10px] text-white/30">La comparación utiliza únicamente los datos disponibles en Knowledge Core. Una diferencia no significa automáticamente incompatibilidad.</p>
      </>}
    </main>
  </div>;
}