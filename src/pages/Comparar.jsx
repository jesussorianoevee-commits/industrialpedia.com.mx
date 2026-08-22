import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldCheck, AlertTriangle, XCircle, CheckCircle2, X } from 'lucide-react';
import { compareIndustrialpedia } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { useLanguage, localizeSpecAttribute } from '@/lib/i18n';

const STATE = {
  compatible: { label: 'COMPATIBLE', short: 'Compatible', cls: 'border-[#16c79a]/60 bg-[#16c79a]/[0.08] text-[#16c79a]', icon: ShieldCheck },
  not_compatible: { label: 'NO COMPATIBLE', short: 'No compatible', cls: 'border-red-400/60 bg-red-400/[0.08] text-red-300', icon: XCircle },
  review: { label: 'SIMILAR', short: 'Revisión técnica', cls: 'border-amber-400/60 bg-amber-400/[0.08] text-amber-300', icon: AlertTriangle },
  insufficient: { label: 'DATOS INSUFICIENTES', short: 'Datos insuficientes', cls: 'border-white/20 bg-white/[0.03] text-white/45', icon: XCircle }
};

const PROPERTY_LABELS_ES = {
  size: 'Tamaño', voltage: 'Voltaje', current: 'Corriente', capacity: 'Capacidad', quantity: 'Cantidad', material: 'Material', resistance: 'Resistencia', temperature: 'Temperatura', frequency: 'Frecuencia', power: 'Potencia', pressure: 'Presión', flow: 'Flujo', diameter: 'Diámetro', length: 'Longitud', width: 'Ancho', height: 'Altura', weight: 'Peso', volume: 'Volumen', area: 'Área', speed: 'Velocidad', torque: 'Torque', stroke: 'Carrera', mounting: 'Montaje', connection: 'Conexión', connector: 'Conector', interface: 'Interfaz', protection: 'Protección', rating: 'Clasificación', thread: 'Rosca', port: 'Puerto'
};
const STATUS_LABELS_ES = { equal: 'Igual', different: 'Diferente', base_only: 'Solo base', candidate_only: 'Solo alternativa', not_comparable: 'No comparable' };
function propertyLabel(value, language = 'es') {
  const raw = String(value || '').trim();
  return localizeSpecAttribute(raw, language);
}
function val(s) { const raw = s?.original_value ?? s?.raw_value ?? ''; const original = `${raw}${s?.original_unit ? ` ${s.original_unit}` : ''}`.trim(); const normalized = s?.normalized_value; const unit = s?.normalized_unit || ''; if (normalized !== null && normalized !== undefined && normalized !== '' && String(normalized) !== String(raw)) return `${original || raw || '—'} → ${normalized}${unit ? ` ${unit}` : ''}`; return original || (normalized !== null && normalized !== undefined ? `${normalized}${unit ? ` ${unit}` : ''}` : '') || '—'; }
function canonical(s) { return String(s?.attribute_canonical || s?.attribute_name || s?.attribute || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function comparisonFor(base, alt) { const differences = Array.isArray(alt?.comparison?.differences) ? alt.comparison.differences : []; return differences.find((d) => canonical(d) === canonical(base)) || null; }
function stateFor(base, alt) { const hit = comparisonFor(base, alt); if (hit?.state) return hit.state; return (alt?.specs || []).some((s) => canonical(s) === canonical(base)) ? 'not_comparable' : 'base_only'; }
function valueFor(base, alt) { const hit = comparisonFor(base, alt); if (hit && hit.candidate !== null && hit.candidate !== undefined && hit.candidate !== '') return hit.candidate; return (alt?.specs || []).find((s) => canonical(s) === canonical(base)); }
const COMPOUND_LABELS_ES = { diameter: 'Diámetro', length: 'Longitud', width: 'Ancho', height: 'Altura', depth: 'Profundidad' };
function normalizedFor(base, alt) { const hit = comparisonFor(base, alt); return hit && hit.normalized_b !== null && hit.normalized_b !== undefined ? { value: hit.normalized_b, unit: hit.normalized_unit } : null; }
function normalizedDisplayFor(normalized) {
  if (!normalized) return '';
  if (Array.isArray(normalized.value)) return normalized.value.map((item) => `${COMPOUND_LABELS_ES[item?.component] || item?.component || 'Componente'}: ${item?.normalized_value ?? '—'}${item?.normalized_unit ? ` ${item.normalized_unit}` : ''}`).join(' · ');
  return normalized.unit ? `${normalized.value} ${normalized.unit}` : String(normalized.value);
}
function statusMeta(component, t) {
  const state = component?.comparison?.state;
  const base = STATE[state] || STATE.insufficient;
  const labels = {
    compatible: [t.compatible, t.compatible],
    not_compatible: [t.notCompatible, t.notCompatible],
    review: [t.similar, t.technicalReview],
    insufficient: [t.insufficientData, t.insufficientData]
  };
  const [label, short] = labels[state] || labels.insufficient;
  return { ...base, label, short };
}

function StatusBadge({ component, base = false, t }) {
  if (base) return <span className="inline-flex items-center gap-1.5 rounded-md border border-[#16c79a]/35 bg-[#16c79a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#16c79a]"><CheckCircle2 className="h-3.5 w-3.5" /> {t.baseComponent}</span>;
  const meta = statusMeta(component, t);
  const Icon = meta.icon;
  const compared = component?.comparison?.compared || 0;
  const equal = component?.comparison?.equal || 0;
  return <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${meta.cls}`}>
    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"><Icon className="h-3.5 w-3.5" />{meta.label}</span>
    <span className="text-[10px] font-mono font-semibold">{equal}/{compared} {t.specsShort}</span>
  </div>;
}

export default function Comparar() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const partNumberHint = searchParams.get('pn') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedResults, setExpandedResults] = useState(false);
  const { language, t } = useLanguage();

  useEffect(() => {
    (async () => {
      try {
        const result = await compareIndustrialpedia(id, partNumberHint, 5);
        setData(result);
      } catch (e) { setError(e?.message || 'No se pudo ejecutar el comparador.'); }
    })();
  }, [id, partNumberHint, language]);

  if (!data && !error) return <div className="min-h-screen bg-[#080d12] flex items-center justify-center text-white/45 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" />Buscando alternativas compatibles…</div>;
  if (error) return <div className="min-h-screen bg-[#080d12] flex flex-col items-center justify-center gap-3 text-white/50 text-sm"><p>{error}</p><button type="button" onClick={() => window.history.back()} className="text-[#65a9e6]">← Volver a ficha</button></div>;

  const base = data.base;
  const alternatives = data.alternatives || [];
  const notEvaluable = data.compatibility_evaluable === false || data.decision?.state === 'not_evaluable';
  const cols = [base, ...alternatives];
  const specRows = [...(base.specs || [])];
  const seenProperties = new Set(specRows.map((s) => canonical(s)));
  for (const alt of alternatives) {
    for (const diff of alt?.comparison?.differences || []) {
      if (diff?.state !== 'candidate_only') continue;
      const key = canonical(diff);
      if (!key || seenProperties.has(key)) continue;
      seenProperties.add(key);
      specRows.push({
        attribute_name: diff.attribute_name || diff.attribute_canonical,
        attribute_canonical: diff.attribute_canonical || diff.attribute_name,
        original_value: null,
        original_unit: null
      });
    }
  }

  return <div className="min-h-screen bg-[#080d12] text-white">
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#080d12]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3">
        <button type="button" onClick={() => window.history.back()} className="rounded-lg border border-white/10 p-2 text-white/60 hover:text-white" aria-label="Volver"><ArrowLeft className="h-4 w-4" /></button>
        <div className="font-mono text-sm tracking-[0.18em]"><span className="font-semibold text-white">INDUSTRIAL</span><span className="text-[#168fd5]">PEDIA</span></div>
        <div className="hidden md:flex items-center gap-6 ml-6 text-xs text-white/45"><span>{t.search}</span><span className="rounded-full bg-[#102333] px-4 py-2 text-[#65a9e6]">{t.compare}</span><span>Fabricantes</span><span>Recursos</span></div>
        <div className="ml-auto flex items-center gap-2"><span className="hidden sm:inline rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55">{language.toUpperCase()}</span><span className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55">◐</span></div>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-4 py-5 sm:py-7">
      <button type="button" onClick={() => window.history.back()} className="mb-4 flex items-center gap-2 text-xs text-[#65a9e6] hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Volver a ficha</button>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">{t.technicalComparison}</h1><p className="mt-1 text-sm text-white/45">{t.compareSubtitle}</p></div>
        <div className="hidden sm:block rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono text-white/35">{data.candidates_considered || 0} {t.candidatesConsulted}</div>
      </div>

      <section className="mb-5 overflow-hidden rounded-xl border border-white/10 bg-[#0d141b]">
        <div className="grid gap-5 p-5 md:grid-cols-[150px_1fr_1fr] md:items-center">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-[#091016]">
            {base.image_url ? <img src={base.image_url} alt="" className="h-full w-full object-contain p-3" referrerPolicy="no-referrer" /> : <div className="text-[10px] text-white/25">{t.noImage}</div>}
          </div>
          <div>
            <StatusBadge component={base} base t={t} />
            <div className="mt-3 font-mono text-xl font-semibold text-white">{base.part_number}</div>
            <div className="mt-1 text-sm text-[#65a9e6]">{base.manufacturer_name || t.manufacturerNotIndicated}</div>
            <div className="mt-2 max-w-xl text-sm text-white/55">{base.product_name || base.description || ''}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            {(base.specs || []).slice(0, 6).map((s, i) => <div key={i}><div className="text-white/30">{propertyLabel(s.attribute_name || s.attribute, language) }</div><div className="mt-0.5 font-mono text-white/80">{val(s)}</div></div>)}
          </div>
        </div>
      </section>

      <>
        <section className="mb-4 rounded-xl border border-white/10 bg-[#0d141b] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-white/90">{t.compatibilityMap}</h2><p className="mt-1 text-[11px] text-white/35">Cada alternativa se evalúa directamente contra el componente base.</p></div>
            <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-white/25">BASE → ALTERNATIVAS</span>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-[#16c79a]/30 bg-[#16c79a]/[0.04] p-3">
              {base.image_url && <img src={base.image_url} alt="" className="h-14 w-14 shrink-0 rounded-md object-contain bg-white p-1" referrerPolicy="no-referrer" />}
              <div className="min-w-0"><div className="text-[9px] font-bold uppercase tracking-wider text-[#16c79a]">{t.baseComponent}</div><div className="mt-1 truncate font-mono text-xs font-semibold text-white">{base.part_number}</div><div className="mt-0.5 truncate text-[10px] text-white/40">{base.manufacturer_name || t.manufacturerNotIndicated}</div></div>
            </div>
            <div className="hidden items-center justify-center lg:flex text-white/20">→</div>
            <div className="grid min-w-0 flex-[2] gap-3 md:grid-cols-3">
              {alternatives.map((c, i) => {
            const meta = statusMeta(c, t); const equal = c.comparison?.equal || 0; const compared = c.comparison?.compared || 0;
            return <div key={i} className={`rounded-xl border p-4 ${meta.cls}`}>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider">{meta.label}</span><span className="font-mono text-[10px] font-semibold">{equal}/{compared} {t.specsShort}</span></div>
              <div className="mt-3 text-xs text-white/50">{t.compatibility}</div>
              <div className="mt-1 text-sm font-semibold text-white/80">{meta.short}</div>
              <div className="mt-2 text-[9px] text-white/30">{t.comparedAgainst}: <span className="font-mono text-white/50">{base.part_number}</span></div>
            </div>;
          })}
            </div>
          </div>
        </section>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d141b] shadow-2xl shadow-black/20">
          <div className="min-w-[820px]">
            <div className="grid" style={{gridTemplateColumns:`170px repeat(${cols.length}, minmax(210px, 1fr))`}}>
              <div className="p-4 text-[10px] uppercase tracking-wider text-white/30">{t.technicalSpecs}</div>
              {cols.map((c, i) => <div key={i} className="border-l border-white/[0.08] p-4">
                <div className="flex items-start gap-3">
                  {c.image_url && <img src={c.image_url} alt="" className="h-12 w-12 shrink-0 rounded-md object-contain bg-white p-1" referrerPolicy="no-referrer" />}
                  <div className="min-w-0"><div className="font-mono text-sm font-semibold text-[#65a9e6] break-all">{c.part_number}</div><div className="mt-1 text-[10px] text-white/40">{c.manufacturer_name || t.manufacturerNotIndicated}</div><div className="mt-1 line-clamp-2 text-xs text-white/55">{c.product_name || c.description || ''}</div></div>
                </div>
              </div>)}
            </div>

            {specRows.map((s, idx) => <div key={`${s.attribute_name}-${idx}`} className="grid" style={{gridTemplateColumns:`170px repeat(${cols.length}, minmax(210px, 1fr))`}}>
              <div className="border-t border-white/[0.06] p-3 text-xs text-white/55">{propertyLabel(s.attribute_name || s.attribute, language) }</div>
              {cols.map((c, ci) => {
                const candidate = ci === 0 ? s : valueFor(s, c);
                const st = ci === 0 ? 'base' : stateFor(s, c);
                const normalized = ci === 0 ? null : normalizedFor(s, c);
                const normalizedDisplay = normalizedDisplayFor(normalized);
                const display = candidate ? (typeof candidate === 'object' ? val(candidate) : String(candidate)) : '—';
                const stateClass = st === 'equal' ? 'text-white/80' : st === 'different' ? 'text-amber-200' : 'text-white/35';
                return <div key={ci} className={`flex items-center justify-between gap-2 border-l border-t border-white/[0.06] p-3 text-xs ${stateClass}`}>
                  <div className="min-w-0"><div className="font-mono leading-relaxed">{display}</div>{normalizedDisplay && <div className="mt-1 text-[9px] font-mono text-white/30">Normalizado: {normalizedDisplay}</div>}</div>
                  {ci > 0 && (st === 'equal' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16c79a]" /> : st === 'different' ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" /> : <span className="text-white/20">—</span>)}
                </div>;
              })}
            </div>)}
          </div>
        </div>

        {(data.candidates_considered || 0) > alternatives.length && !expandedResults && !loadingMore && (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-[#0d141b] px-5 py-4 text-center">
            <div className="text-xs font-medium text-white/65">{t.noMore}</div>
            <div className="text-[10px] text-white/35">{t.expandSearch}</div>
            <button
              type="button"
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                try {
                  const expanded = await compareIndustrialpedia(id, partNumberHint, 10);
                  setData(expanded);
                  setExpandedResults(true);
                } catch (e) {
                  setError(e?.message || 'No se pudieron cargar más alternativas.');
                } finally {
                  setLoadingMore(false);
                }
              }}
              className="mt-1 rounded-lg border border-[#65a9e6]/35 bg-[#65a9e6]/[0.08] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#65a9e6] hover:bg-[#65a9e6]/[0.14] disabled:opacity-50"
            >{t.moreAlternatives}</button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[10px] text-white/45">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[#16c79a]" /> {STATUS_LABELS_ES.equal}</span>
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-300" /> {STATUS_LABELS_ES.different} (revisar)</span>
          <span className="flex items-center gap-1.5"><X className="h-3.5 w-3.5 text-red-400" /> No coincide</span>
          <span className="flex items-center gap-1.5"><span className="text-white/30">○</span> No especificado</span>
        </div>
        <p className="mt-3 text-[10px] text-white/30">La comparación inicial muestra un máximo de 5 alternativas para mantener una lectura clara. Si necesitas ampliar la búsqueda, puedes solicitar más alternativas. La comparación usa únicamente datos del Knowledge Core. “Compatible” solo se declara cuando las reglas de familia y los requisitos disponibles permiten demostrarlo; datos críticos faltantes llevan a revisión.</p>
      </>
    </main>
  </div>;
}