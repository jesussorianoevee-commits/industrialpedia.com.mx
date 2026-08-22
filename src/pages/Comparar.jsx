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
function normalizedDisplayFor(normalized, language = 'es') {
  if (!normalized) return '';
  if (Array.isArray(normalized.value)) return normalized.value.map((item) => `${localizeSpecAttribute(COMPOUND_LABELS_ES[item?.component] || item?.component || 'Componente', language)}: ${item?.normalized_value ?? '—'}${item?.normalized_unit ? ` ${item.normalized_unit}` : ''}`).join(' · ');
  return normalized.unit ? `${normalized.value} ${normalized.unit}` : String(normalized.value);
}
function statusMeta(component, t) {
  const state = component?.comparison?.state;
  const base = STATE[state] || STATE.insufficient;
  const labels = {
    compatible: [t.compatible, t.compatible],
    not_compatible: [t.notCompatible, t.notCompatible],
    review: [t.technicalMatch || 'COINCIDENCIA TÉCNICA', t.technicalReview],
    insufficient: [t.insufficientData, t.insufficientData]
  };
  const [label, short] = labels[state] || labels.insufficient;
  return { ...base, label, short };
}

function evidenceSummary(component, language = 'es') {
  const differences = Array.isArray(component?.comparison?.differences) ? component.comparison.differences : [];
  const equal = differences.filter((d) => d?.state === 'equal');
  const different = differences.filter((d) => d?.state === 'different');
  const missing = differences.filter((d) => ['base_only', 'candidate_only', 'not_comparable'].includes(d?.state));
  return { equal, different, missing };
}

function decisionVisualState(component) {
  const state = component?.comparison?.state;
  if (state === 'compatible') return 'compatible';
  if (state === 'not_compatible') return 'not_compatible';
  return 'similar';
}

const DECISION_VISUAL = {
  compatible: { label: 'COMPATIBLE', cls: 'border-[#16c79a]/60 bg-[#16c79a]/[0.10] text-[#16c79a]', dot: 'bg-[#16c79a]' },
  similar: { label: 'SIMILAR', cls: 'border-amber-400/60 bg-amber-400/[0.08] text-amber-300', dot: 'bg-amber-300' },
  not_compatible: { label: 'NO COMPATIBLE', cls: 'border-red-400/60 bg-red-400/[0.08] text-red-300', dot: 'bg-red-400' }
};

function compactComparisonValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map((item) => item?.normalized_value !== undefined ? `${item.normalized_value}${item.normalized_unit ? ` ${item.normalized_unit}` : ''}` : JSON.stringify(item)).join(' · ');
    if (value.value !== undefined) return `${value.value}${value.unit ? ` ${value.unit}` : ''}`;
    return JSON.stringify(value);
  }
  return String(value);
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
  const [expandedSpecs, setExpandedSpecs] = useState({});
  const [expandedMobileSpecs, setExpandedMobileSpecs] = useState({});
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

    <main className="mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-7 w-full min-w-0">
      <button type="button" onClick={() => window.history.back()} className="mb-4 flex items-center gap-2 text-xs text-[#65a9e6] hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Volver a ficha</button>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
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
            <div><h2 className="text-sm font-semibold text-white/90">{t.compatibilityMap}</h2><p className="mt-1 text-[11px] text-white/35">Primero se muestran las piezas candidatas; después se comparan sus fichas técnicas propiedad por propiedad contra el componente base.</p></div>
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
            const evidence = evidenceSummary(c, language);
            const visualState = decisionVisualState(c);
            const visual = DECISION_VISUAL[visualState];
            return <div key={i} className={`rounded-xl border p-4 ${meta.cls}`}>
              <div className="flex items-center justify-between gap-2"><span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider`}><span className={`h-2 w-2 rounded-full ${visual.dot}`} />{visual.label}</span><span className="font-mono text-[10px] font-semibold">{equal}/{compared} {t.specsShort}</span></div>
              <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/[0.10] px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/35">Qué lo hace {visualState === 'compatible' ? 'compatible' : visualState === 'not_compatible' ? 'no compatible' : 'similar'}</div>
                <div className="mt-1 text-[10px] text-white/55">{visualState === 'compatible' ? `${equal} propiedades coinciden con la ficha base.` : visualState === 'not_compatible' ? `${evidence.different.length} propiedades presentan diferencias críticas.` : `${equal} propiedades coinciden y ${evidence.different.length} presentan diferencias o requieren revisión.`}</div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-white">
                  {c.image_url ? <img src={c.image_url} alt={c.part_number || ''} className="h-full w-full object-contain p-1" referrerPolicy="no-referrer" /> : <span className="text-[9px] text-black/35">{t.noImage}</span>}
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/35">{t.alternatives || 'Alternativa'}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-white">{c.part_number}</div>
                  <div className="mt-0.5 truncate text-[10px] text-white/40">{c.manufacturer_name || t.manufacturerNotIndicated}</div>
                </div>
              </div>
              {c.product_name && <div className="mt-3 text-[10px] leading-relaxed text-white/45">{c.product_name}</div>}
              {Array.isArray(c.specs) && c.specs.length > 0 && <div className="mt-3 rounded-lg border border-white/[0.07] bg-[#091016]/70 p-3">
                <div className="flex items-center justify-between gap-2"><div className="text-[9px] font-bold uppercase tracking-wider text-white/35">Ficha técnica</div><div className="text-[9px] font-mono text-white/25">{c.specs.length} datos</div></div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(expandedSpecs[c.id] ? c.specs : c.specs.slice(0, 6)).map((s, j) => {
                    const baseSpec = (base.specs || []).find((b) => canonical(b) === canonical(s));
                    const propertyState = baseSpec ? stateFor(baseSpec, c) : 'candidate_only';
                    const isIncompatible = propertyState === 'different' && c.comparison?.state === 'not_compatible';
                    const valueTone = propertyState === 'equal' ? 'text-[#16c79a]' : isIncompatible ? 'text-red-300' : propertyState === 'different' ? 'text-amber-300' : 'text-white/55';
                    const valueBg = propertyState === 'equal' ? 'bg-[#16c79a]/[0.06]' : isIncompatible ? 'bg-red-400/[0.06]' : propertyState === 'different' ? 'bg-amber-400/[0.06]' : '';
                    const indicator = propertyState === 'equal' ? '🟢' : isIncompatible ? '🔴' : propertyState === 'different' ? '🟡' : '⚪';
                    return <div key={j} className={`min-w-0 rounded-md border border-white/[0.04] px-2 py-1.5 ${valueBg}`}>
                      <div className="flex items-center gap-1.5"><span className="text-[10px]" aria-hidden="true">{indicator}</span><div className="truncate text-[11px] font-medium text-white/45">{propertyLabel(s.attribute_name || s.attribute, language)}</div></div>
                      <div className={`mt-1 font-mono text-[13px] font-semibold leading-relaxed break-words ${valueTone}`}>{val(s)}</div>
                    </div>;
                  })}
                </div>
                {c.specs.length > 6 && <button type="button" onClick={() => setExpandedSpecs((prev) => ({ ...prev, [c.id]: !prev[c.id] }))} className="mt-3 w-full rounded-md border border-[#65a9e6]/25 bg-[#65a9e6]/[0.05] px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-[#65a9e6] hover:bg-[#65a9e6]/[0.10]">{expandedSpecs[c.id] ? 'Ver menos' : `Ver más · ${c.specs.length - 6} datos`}</button>}
              </div>}
              <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/[0.10] p-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/35">{t.comparedAgainst}</div>
                <div className="mt-1 font-mono text-xs font-semibold text-white">{base.part_number}</div>
                {evidence.equal.length > 0 && <div className="mt-3 rounded-md border border-[#16c79a]/15 bg-[#16c79a]/[0.03] p-2"><div className="text-[9px] uppercase tracking-wider text-[#16c79a]/90">{t.matchingSpecs || 'Lo que coincide'}</div><div className="mt-1.5 space-y-1">{evidence.equal.map((d, j) => <div key={j} className="text-[10px] text-white/60"><span className="text-white/35">{propertyLabel(d.attribute_name || d.attribute_canonical, language)}:</span> <span className="font-mono text-white/80">{compactComparisonValue(d.base)}</span> <span className="font-bold text-[#16c79a]">=</span> <span className="font-mono text-white/80">{compactComparisonValue(d.candidate)}</span></div>)}</div></div>}
                {evidence.different.length > 0 && <div className={`mt-3 rounded-md border p-2 ${visualState === 'not_compatible' ? 'border-red-400/20 bg-red-400/[0.04]' : 'border-amber-400/15 bg-amber-400/[0.03]'}`}><div className={`text-[9px] uppercase tracking-wider ${visualState === 'not_compatible' ? 'text-red-300/90' : 'text-amber-300/90'}`}>{visualState === 'not_compatible' ? 'Lo que impide la compatibilidad' : (t.differentSpecs || 'Lo que difiere')}</div><div className="mt-1.5 space-y-1">{evidence.different.map((d, j) => <div key={j} className="text-[10px] text-white/60"><span className="text-white/35">{propertyLabel(d.attribute_name || d.attribute_canonical, language)}:</span> <span className="font-mono text-white/75">{compactComparisonValue(d.base)}</span> <span className={`font-bold ${visualState === 'not_compatible' ? 'text-red-300' : 'text-amber-300'}`}>≠</span> <span className="font-mono text-white/75">{compactComparisonValue(d.candidate)}</span></div>)}</div></div>}
                {evidence.equal.length === 0 && evidence.different.length === 0 && evidence.missing.length > 0 && <div className="mt-2 text-[10px] text-white/40">{t.insufficientData}</div>}
              </div>
              <div className="mt-3 text-xs text-white/50">{t.compatibility}</div>
              <div className="mt-1 text-sm font-semibold text-white/80">{meta.short}</div>
            </div>;
          })}
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-xl border border-white/10 bg-[#0d141b] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[#65a9e6]" />
            <div><h2 className="text-sm font-semibold text-white/90">Fichas técnicas comparadas</h2><p className="mt-1 text-[11px] text-white/35">Aquí se ve exactamente qué dato de la ficha de cada fabricante coincide, difiere o falta.</p></div>
          </div>
        </section>
        {/* En móvil no obligamos al usuario a adivinar qué columna está viendo.
            La tabla completa sigue disponible en desktop/tablet, pero en teléfono
            mostramos una matriz apilada por alternativa con los mismos datos y estados. */}
        <div className="mb-4 md:hidden space-y-3">
          {alternatives.map((c, ci) => {
            const mobileRows = specRows.map((s) => {
              const baseValue = s.original_value !== null && s.original_value !== undefined && s.original_value !== ''
                ? val(s)
                : '—';
              const candidate = valueFor(s, c);
              const state = stateFor(s, c);
              const candidateValue = candidate !== null && candidate !== undefined && candidate !== ''
                ? (typeof candidate === 'object' ? val(candidate) : String(candidate))
                : '—';
              return { s, baseValue, candidateValue, state };
            }).filter((row) => row.baseValue !== '—' || row.candidateValue !== '—');
            const visible = expandedMobileSpecs[c.id] ? mobileRows : mobileRows.slice(0, 8);
            return (
              <section key={c.id || ci} className="rounded-xl border border-white/10 bg-[#0d141b] overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] p-3">
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-white/30">{t.alternatives || 'Alternativa'}</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-[#65a9e6] break-all">{c.part_number}</div>
                    <div className="mt-0.5 text-[10px] text-white/40">{c.manufacturer_name || t.manufacturerNotIndicated}</div>
                  </div>
                  <div className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${statusMeta(c, t).cls}`}>
                    {statusMeta(c, t).label}
                  </div>
                </div>
                <div className="px-3 py-2 text-[9px] text-white/30 border-b border-white/[0.06]">
                  <span className="text-white/50">Base:</span> {base.part_number} · <span className="text-white/50">Alternativa:</span> {c.part_number}
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {visible.map(({ s, baseValue, candidateValue, state }, j) => {
                    const valueClass = state === 'equal'
                      ? 'text-[#16c79a]'
                      : state === 'different'
                        ? (c.comparison?.state === 'not_compatible' ? 'text-red-300' : 'text-amber-300')
                        : state === 'not_comparable'
                          ? 'text-red-300'
                          : 'text-white/35';
                    const stateIcon = state === 'equal' ? '✓' : state === 'different' ? '⚠' : state === 'not_comparable' ? '✕' : '○';
                    return (
                      <div key={`${s.attribute_name}-${j}`} className="grid grid-cols-[1fr_auto] gap-3 p-3">
                        <div className="min-w-0">
                          <div className="text-[10px] text-white/45">{propertyLabel(s.attribute_name || s.attribute, language)}</div>
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            <div className="min-w-0 rounded-md bg-white/[0.025] px-2 py-1.5">
                              <div className="text-[8px] uppercase tracking-wider text-white/25">Base</div>
                              <div className="mt-0.5 break-words font-mono text-[10px] text-white/65">{baseValue}</div>
                            </div>
                            <div className="min-w-0 rounded-md bg-white/[0.025] px-2 py-1.5">
                              <div className="text-[8px] uppercase tracking-wider text-white/25">{t.alternatives || 'Alternativa'}</div>
                              <div className={`mt-0.5 break-words font-mono text-[10px] font-semibold ${valueClass}`}>{candidateValue}</div>
                            </div>
                          </div>
                        </div>
                        <div className={`pt-5 text-xs font-bold ${valueClass}`} aria-label={state}>{stateIcon}</div>
                      </div>
                    );
                  })}
                </div>
                {mobileRows.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setExpandedMobileSpecs((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                    className="w-full border-t border-white/[0.07] bg-[#65a9e6]/[0.04] px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-[#65a9e6]"
                  >
                    {expandedMobileSpecs[c.id] ? 'Ver menos' : `Ver más · ${mobileRows.length - 8} datos`}
                  </button>
                )}
              </section>
            );
          })}
        </div>

        <div className="hidden md:block ip-scroll-x rounded-xl border border-white/10 bg-[#0d141b] shadow-2xl shadow-black/20">
          <div className="min-w-[820px]">
            <div className="grid" style={{gridTemplateColumns:`170px repeat(${cols.length}, minmax(210px, 1fr))`}}>
              <div className="p-4 text-[10px] uppercase tracking-wider text-white/30">{t.technicalSpecs}</div>
              {cols.map((c, i) => <div key={i} className="border-l border-white/[0.08] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                    {c.image_url ? <img src={c.image_url} alt={c.part_number || ''} className="h-full w-full object-contain p-1" referrerPolicy="no-referrer" /> : <span className="text-[8px] text-black/35">{t.noImage}</span>}
                  </div>
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
                const normalizedDisplay = normalizedDisplayFor(normalized, language);
                const hasCandidateValue = candidate !== null && candidate !== undefined && candidate !== '';
                const display = hasCandidateValue ? (typeof candidate === 'object' ? val(candidate) : String(candidate)) : '—';
                const stateClass = st === 'equal' ? 'text-[#16c79a]' : st === 'different' ? 'text-amber-300' : st === 'not_comparable' ? 'text-red-300' : 'text-white/35';
                const stateBg = st === 'equal' ? 'bg-[#16c79a]/[0.06]' : st === 'different' ? 'bg-amber-400/[0.06]' : st === 'not_comparable' ? 'bg-red-400/[0.06]' : '';
                return <div key={ci} className={`flex items-center justify-between gap-2 border-l border-t border-white/[0.06] p-3 text-xs ${stateClass} ${stateBg}`}>
                  <div className="min-w-0"><div className="font-mono leading-relaxed">{display}</div>{normalizedDisplay && <div className="mt-1 text-[9px] font-mono text-white/35">{language === 'es' ? 'Normalizado' : language === 'de' ? 'Normalisiert' : language === 'fr' ? 'Normalisé' : language === 'zh' ? '标准化' : 'Normalized'}: {normalizedDisplay}</div>}</div>
                  {ci > 0 && (st === 'equal' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16c79a]" /> : st === 'different' ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" /> : st === 'not_comparable' ? <XCircle className="h-4 w-4 shrink-0 text-red-300" /> : <span className="text-white/20">—</span>)}
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

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-white/45">
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