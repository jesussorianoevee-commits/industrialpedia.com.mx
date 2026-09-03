import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import { compareReferenceIndustrialpedia } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { useLanguage, localizeSpecAttribute } from '@/lib/i18n';

const stateMeta = {
  strong_match: { label: 'SIMILITUD ALTA', cls: 'text-[#16c79a] border-[#16c79a]/30 bg-[#16c79a]/[0.05]', icon: ShieldCheck },
  partial_match: { label: 'SIMILITUD PARCIAL', cls: 'text-amber-300 border-amber-300/30 bg-amber-300/[0.05]', icon: AlertTriangle },
  low_similarity: { label: 'SIMILITUD BAJA', cls: 'text-white/45 border-white/10 bg-white/[0.02]', icon: XCircle },
  insufficient_evidence: { label: 'EVIDENCIA INSUFICIENTE', cls: 'text-white/45 border-white/10 bg-white/[0.02]', icon: XCircle }
};

function specValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object' && !Array.isArray(v)) return `${v.value ?? ''}${v.unit ? ` ${v.unit}` : ''}`.trim() || JSON.stringify(v);
  return String(v);
}

export default function CompararReferencia() {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const ref = location.state?.reference;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const technicalSpecs = ref?.specifications && typeof ref.specifications === 'object' && !Array.isArray(ref.specifications)
      ? Object.entries(ref.specifications).filter(([, value]) => value !== null && value !== undefined && value !== '' && !(typeof value === 'object' && !Array.isArray(value) && value.value === undefined && value.min === undefined && value.max === undefined))
      : [];

    if (!ref?.category) {
      setError('Falta la familia técnica de la referencia.');
      return;
    }

    if (technicalSpecs.length < 3) {
      setError(`Se requieren al menos 3 especificaciones técnicas para comparar. Actualmente hay ${technicalSpecs.length}. Agrega más datos como dimensiones, conexión, alimentación, montaje, IP, salida o rango.`);
      return;
    }

    (async () => {
      try {
        const result = await compareReferenceIndustrialpedia(ref);
        setData(result);
      } catch (e) {
        setError(e?.message || 'No se pudo ejecutar la comparación.');
      }
    })();
  }, [ref]);

  if (!data && !error) return <div className="min-h-screen bg-[#080d12] flex items-center justify-center text-white/45 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" />Buscando alternativas técnicas…</div>;

  if (error) return <div className="min-h-screen bg-[#080d12] text-white flex flex-col items-center justify-center gap-4 px-5"><p className="text-sm text-white/60 text-center">{error}</p><button onClick={() => navigate(-1)} className="text-[#65a9e6] text-sm">← Volver</button></div>;

  const result = data?.result || {};
  const alternatives = Array.isArray(result.alternatives) ? result.alternatives : [];
  const reference = data.reference || ref;

  return <div className="min-h-screen bg-[#080d12] text-white">
    <header className="ip-header">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="rounded-lg border border-white/10 p-2 text-white/60 hover:text-white"><ArrowLeft className="h-4 w-4" /></button>
        <div className="font-mono text-sm tracking-[0.18em]"><span className="font-semibold">INDUSTRIAL</span><span className="text-[#168fd5]">PEDIA</span></div>
        <span className="text-xs text-white/35">Comparación de referencia</span>
      </div>
    </header>

    <main className="mx-auto max-w-6xl px-3 sm:px-4 py-5 sm:py-6 w-full min-w-0">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Alternativas para {reference.partNumber || 'referencia externa'}</h1>
        <p className="mt-1 text-sm text-white/40">La referencia externa no se almacena en Industrialpedia. Se compara en esta sesión contra el Knowledge Core. Se requieren mínimo 3 especificaciones técnicas válidas para evitar falsos equivalentes.</p>
      </div>

      <section className="ip-card p-4 sm:p-5 mb-5">
        <div className="text-[10px] uppercase tracking-wider text-white/30">REFERENCIA</div>
        <div className="mt-2 font-mono text-lg text-[#65a9e6]">{reference.partNumber || 'Sin número de parte'}</div>
        <div className="mt-1 text-sm text-white/55">{reference.manufacturer || 'Fabricante externo'} · {reference.category}</div>
        <div className="mt-4 grid gap-2.5 sm:gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(reference.specifications || {}).map(([k, v]) => <div key={k} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><div className="text-[10px] text-white/30">{localizeSpecAttribute(k, language)}</div><div className="mt-1 text-xs font-mono text-white/75 break-words">{specValue(v)}</div></div>)}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Alternativas encontradas</h2><span className="text-[10px] text-white/30">{alternatives.length} candidato(s)</span></div>
        {alternatives.length === 0 ? <div className="ip-card p-8 text-center text-sm text-white/40">No hay suficientes datos comparables en el Knowledge Core. Esto no significa que no exista un equivalente; significa que la evidencia disponible no alcanza el umbral técnico.</div> : alternatives.map((a) => {
          const state = stateMeta[a.comparison?.state] || stateMeta.low_similarity;
          const Icon = state.icon;
          return <article key={a.id} className="ip-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><div className="font-mono text-sm text-[#65a9e6] break-all">{a.part_number}</div><div className="mt-1 text-sm text-white/75">{a.name || 'Producto'}</div><div className="mt-1 text-[11px] text-white/35">{a.category || ''} · {a.status || 'candidate'}</div></div>
              <div className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold shrink-0 ${state.cls}`}><Icon className="h-3.5 w-3.5" />{state.label}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]"><div><span className="text-white/30">Coinciden</span><div className="mt-1 font-mono text-white/75">{a.comparison?.equal_specs ?? a.comparison?.equal ?? 0}</div></div><div><span className="text-white/30">Compartidas</span><div className="mt-1 font-mono text-white/75">{a.comparison?.shared_specs ?? a.comparison?.compared ?? 0}</div></div><div><span className="text-white/30">Diferentes</span><div className="mt-1 font-mono text-amber-200">{a.comparison?.different_specs ?? a.comparison?.different ?? 0}</div></div><div><span className="text-white/30">Similitud</span><div className="mt-1 font-mono text-white/80">{a.comparison?.similarity_pct ?? '—'}%</div></div></div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{Object.entries(a.specifications || {}).map(([k,v]) => <div key={k} className="rounded bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[10px] text-white/55"><span className="text-white/30">{localizeSpecAttribute(k, language)}:</span> {specValue(v)}</div>)}</div>
            {a.source_url && <a href={a.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[11px] text-[#65a9e6] hover:underline">{t.compareModelSource} →</a>}
            {a.comparison?.state === 'strong_match' && <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-[10px] text-amber-100/70">Coincidencia técnica fuerte, no autorización automática de sustitución. Valida requisitos críticos y documentación del fabricante antes de instalar.</div>}
          </article>;
        })}
      </section>

      <p className="mt-5 text-[10px] text-white/30">La similitud técnica no equivale automáticamente a intercambiabilidad. Antes de sustituir una pieza deben validarse dimensiones, montaje, conexión, condiciones de operación, requisitos críticos y documentación del fabricante.</p>
    </main>
  </div>;
}
