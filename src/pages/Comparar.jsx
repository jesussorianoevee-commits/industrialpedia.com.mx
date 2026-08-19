import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STATE = {
  compatible: { label: 'Compatible con los datos disponibles', cls: 'text-[#47bcb6] bg-[#47bcb6]/10 border-[#47bcb6]/20', icon: ShieldCheck },
  review: { label: 'Requiere revisión', cls: 'text-amber-300 bg-amber-300/10 border-amber-300/20', icon: AlertTriangle },
  insufficient: { label: 'Evidencia insuficiente', cls: 'text-red-300 bg-red-300/10 border-red-300/20', icon: XCircle }
};

function val(s) { return `${s?.normalized_value || s?.original_value || ''}${s?.normalized_unit || s?.original_unit ? ` ${s.normalized_unit || s.original_unit}` : ''}`.trim() || 'No disponible'; }
function canonical(s) { return String(s?.attribute_canonical || s?.attribute_name || s?.attribute || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function stateFor(base, alt) {
  const a = alt.comparison?.differences?.find((d) => String(d.attribute_canonical || d.attribute).trim().toLowerCase().replace(/\s+/g, ' ') === canonical(base));
  if (!a) return 'equal';
  return a.state;
}

export default function Comparar() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke('Comparar', { part_id: id });
        setData(res.data);
      } catch (e) { setError(e?.message || 'No se pudo ejecutar el comparador.'); }
    })();
  }, [id]);

  if (!data && !error) return <div className="min-h-screen bg-[#0a0e12] flex items-center justify-center text-white/45 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" />Buscando alternativas compatibles…</div>;
  if (error) return <div className="min-h-screen bg-[#0a0e12] flex flex-col items-center justify-center gap-3 text-white/50 text-sm"><p>{error}</p><Link to={`/parte/${id}`} className="text-[#5a9cd9]">← Volver a ficha</Link></div>;

  const base = data.base;
  const alternatives = data.alternatives || [];
  const notEvaluable = data.compatibility_evaluable === false || data.decision?.state === 'not_evaluable';
  const cols = [base, ...alternatives];

  return <div className="min-h-screen bg-[#0a0e12] grid-bg text-white">
    <header className="sticky top-0 z-30 bg-[#0a0e12]/90 backdrop-blur border-b border-white/10 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center gap-3"><Link to={`/parte/${id}`} className="text-white/55 hover:text-white"><ArrowLeft className="w-4 h-4" /></Link><div><div className="text-[10px] uppercase tracking-[0.18em] text-white/35">COMPARAR</div><div className="font-mono text-sm text-white/80">{base.part_number}</div></div></div>
    </header>
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <section className="rounded-xl border border-white/10 bg-[#11161c] p-5">
        <div className="flex items-center justify-between gap-3"><div><h1 className="text-lg font-semibold">Comparación técnica</h1><p className="text-xs text-white/40 mt-1">Busca en tiempo real hasta 3 alternativas con evidencia técnica disponible.</p></div><span className="text-[10px] text-white/35">{data.candidates_considered} candidatos consultados</span></div>
        <div className={`mt-4 rounded-lg border p-3 text-xs ${notEvaluable ? 'border-amber-300/20 bg-amber-300/5 text-amber-200/80' : 'border-[#47bcb6]/15 bg-[#47bcb6]/[0.03] text-white/55'}`}>{data.decision?.message}</div>
      </section>

      {notEvaluable ? (
        <section className="rounded-xl border border-amber-300/15 bg-amber-300/[0.025] p-5 text-sm text-white/55">
          <div className="font-semibold text-amber-200/85">Compatibilidad no evaluable</div>
          <p className="mt-2 text-xs leading-relaxed">La ficha base no tiene especificaciones verificadas en Knowledge Core. Las <code>basic_specs</code> no se utilizan para emitir una comparación técnica.</p>
        </section>
      ) : <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#10151b]">
        <div className="min-w-[760px]">
          <div className="grid" style={{gridTemplateColumns:`220px repeat(${cols.length}, minmax(190px, 1fr))`}}>
            <div className="p-4 border-b border-white/10 text-[10px] uppercase tracking-wider text-white/30">Componente</div>
            {cols.map((c, i) => <div key={i} className="p-4 border-b border-l border-white/10">
              {c.image_url && <img src={c.image_url} alt="" className="h-16 w-16 rounded-lg object-contain bg-white p-1 mb-2" referrerPolicy="no-referrer" />}
              <div className="text-[10px] uppercase tracking-wider text-[#5a9cd9]">{c.manufacturer_name || 'Fabricante no indicado'}</div>
              <div className="font-mono text-xs mt-1 text-white/90 break-all">{c.part_number}</div>
              <div className="text-[11px] text-white/45 mt-1 line-clamp-2">{c.product_name || c.description || ''}</div>
              {i > 0 && <span className={`inline-flex mt-2 px-2 py-1 rounded border text-[9px] ${STATE[c.comparison?.state]?.cls || STATE.insufficient.cls}`}>{STATE[c.comparison?.state]?.label || 'Revisión'}</span>}
            </div>)}
          </div>

          {(base.specs || []).map((s, idx) => <div key={`${s.attribute_name}-${idx}`} className="grid" style={{gridTemplateColumns:`220px repeat(${cols.length}, minmax(190px, 1fr))`}}>
            <div className="p-3 border-t border-white/[0.06] text-xs font-mono text-white/55">{s.attribute_name || s.attribute}</div>
            {cols.map((c, ci) => {
              const candidate = ci === 0 ? s : (c.specs || []).find((x) => String(x.attribute_name || x.attribute).toLowerCase() === String(s.attribute_name || s.attribute).toLowerCase());
              const st = ci === 0 ? 'base' : stateFor(s, c);
              return <div key={ci} className={`p-3 border-t border-l border-white/[0.06] text-xs font-mono ${st === 'equal' ? 'text-[#47bcb6]/85' : st === 'different' ? 'text-amber-200/85' : 'text-white/35'}`}>{candidate ? val(candidate) : 'No disponible'}</div>;
            })}
          </div>)}
        </div>
      </div>}
      {!notEvaluable && <p className="text-[10px] text-white/25">Verde = mismo valor · amarillo = diferencia · gris = no disponible. La comparación no sustituye el datasheet y no declara automáticamente que una alternativa sea mejor.</p>}
    </main>
  </div>;
}
