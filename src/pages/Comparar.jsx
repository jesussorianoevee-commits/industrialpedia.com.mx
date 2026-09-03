import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, XCircle, CheckCircle2, X, Moon, Sun } from 'lucide-react';
import { compareIndustrialpedia } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { normalizeTechnicalNotation, canonicalTechnicalAttribute } from '../../base44/shared/technicalNotation.js';
import { useLanguage, localizeSpecAttributeStrict } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import IndustrialpediaLoader from '@/components/ui/IndustrialpediaLoader';

const STATE = {
  compatible: { label: 'COMPATIBLE', short: 'Compatible', cls: 'border-[#16c79a]/60 bg-[#16c79a]/[0.08] ip-compare-match', icon: ShieldCheck },
  not_compatible: { label: 'NO COMPATIBLE', short: 'No compatible', cls: 'border-red-400/60 bg-red-400/[0.08] ip-compare-danger', icon: XCircle },
  review: { label: 'SIMILAR', short: 'Revisión técnica', cls: 'border-amber-400/60 bg-amber-400/[0.08] ip-compare-warning', icon: AlertTriangle },
  insufficient: { label: 'DATOS INSUFICIENTES', short: 'Datos insuficientes', cls: 'border-white/20 bg-white/[0.03] text-white/45', icon: XCircle }
};

const PROPERTY_LABELS_ES = {
  size: 'Tamaño', voltage: 'Voltaje', current: 'Corriente', capacity: 'Capacidad', quantity: 'Cantidad', material: 'Material', resistance: 'Resistencia', temperature: 'Temperatura', frequency: 'Frecuencia', power: 'Potencia', pressure: 'Presión', flow: 'Flujo', diameter: 'Diámetro', length: 'Longitud', width: 'Ancho', height: 'Altura', weight: 'Peso', volume: 'Volumen', area: 'Área', speed: 'Velocidad', torque: 'Torque', stroke: 'Carrera', mounting: 'Montaje', connection: 'Conexión', connector: 'Conector', interface: 'Interfaz', protection: 'Protección', rating: 'Clasificación', thread: 'Rosca', port: 'Puerto'
};
const STATUS_LABELS_ES = { equal: 'Igual', different: 'Diferente', base_only: 'Solo base', candidate_only: 'Solo alternativa', not_comparable: 'No comparable' };
function propertyLabel(value, language = 'es') {
  const raw = String(value || '').trim();
  return localizeSpecAttributeStrict(raw, language);
}
// Prefiere el nombre real (display_name_es de spec_property_definitions,
// resuelto en compareIndustrialpedia via mode=property_labels). Si la
// propiedad todavia no esta formalizada en la taxonomia, cae a la version
// estricta -- nunca a la mezcla palabra por palabra (produce texto roto
// tipo "potencia loss" en vez de quedarse en ingles limpio).
function propertyLabelFromSpec(spec, language = 'es') {
  if (spec?.has_formal_label && spec?.attribute_canonical) return spec.attribute_canonical;
  return propertyLabel(spec?.attribute_name || spec?.attribute || '', language);
}
function val(s, language = 'es') { const raw = s?.original_value ?? s?.raw_value ?? ''; const original = `${raw}${s?.original_unit ? ` ${s.original_unit}` : ''}`.trim(); const normalized = s?.normalized_value; const unit = s?.normalized_unit || ''; const rendered = normalized !== null && normalized !== undefined && normalized !== '' && String(normalized) !== String(raw) ? `${original || raw || '—'} → ${normalized}${unit ? ` ${unit}` : ''}` : (original || (normalized !== null && normalized !== undefined ? `${normalized}${unit ? ` ${unit}` : ''}` : '') || '—'); return normalizeTechnicalNotation(rendered, { language }); }
function canonical(s) { return canonicalTechnicalAttribute(s?.attribute_canonical || s?.attribute_name || s?.attribute || ''); }
function comparisonFor(base, alt) { const differences = Array.isArray(alt?.comparison?.differences) ? alt.comparison.differences : []; return differences.find((d) => canonical(d) === canonical(base)) || null; }
function stateFor(base, alt) { const hit = comparisonFor(base, alt); if (hit?.state) return hit.state; return (alt?.specs || []).some((s) => canonical(s) === canonical(base)) ? 'not_comparable' : 'base_only'; }
function valueFor(base, alt) { const hit = comparisonFor(base, alt); if (hit && hit.candidate !== null && hit.candidate !== undefined && hit.candidate !== '') return hit.candidate; return (alt?.specs || []).find((s) => canonical(s) === canonical(base)); }
const COMPOUND_LABELS_ES = { diameter: 'Diámetro', length: 'Longitud', width: 'Ancho', height: 'Altura', depth: 'Profundidad' };
function normalizedFor(base, alt) { const hit = comparisonFor(base, alt); return hit && hit.normalized_b !== null && hit.normalized_b !== undefined ? { value: hit.normalized_b, unit: hit.normalized_unit } : null; }
function normalizedDisplayFor(normalized, language = 'es') {
  if (!normalized) return '';
  if (Array.isArray(normalized.value)) return normalized.value.map((item) => `${localizeSpecAttributeStrict(COMPOUND_LABELS_ES[item?.component] || item?.component || 'Componente', language)}: ${normalizeTechnicalNotation(item?.normalized_value ?? '—', { language })}${item?.normalized_unit ? ` ${item.normalized_unit}` : ''}`).join(' · ');
  return normalizeTechnicalNotation(normalized.unit ? `${normalized.value} ${normalized.unit}` : String(normalized.value), { language });
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
  compatible: { label: 'COMPATIBLE', cls: 'border-[#16c79a]/60 bg-[#16c79a]/[0.10] ip-compare-match', dot: 'bg-[#16c79a]' },
  similar: { label: 'SIMILAR', cls: 'border-amber-400/60 bg-amber-400/[0.08] ip-compare-warning', dot: 'bg-amber-300' },
  not_compatible: { label: 'NO COMPATIBLE', cls: 'border-red-400/60 bg-red-400/[0.08] ip-compare-danger', dot: 'bg-red-400' }
};

function compactComparisonValue(value, language = 'es') {
  if (value === null || value === undefined || value === '') return '—';
  let rendered;
  if (typeof value === 'object') {
    if (Array.isArray(value)) rendered = value.map((item) => item?.normalized_value !== undefined ? `${item.normalized_value}${item.normalized_unit ? ` ${item.normalized_unit}` : ''}` : JSON.stringify(item)).join(' · ');
    else if (value.value !== undefined) rendered = `${value.value}${value.unit ? ` ${value.unit}` : ''}`;
    else rendered = JSON.stringify(value);
  } else rendered = String(value);
  return normalizeTechnicalNotation(rendered, { language });
}

function StatusBadge({ component, base = false, t }) {
  if (base) return <span className="inline-flex items-center gap-1.5 rounded-md border border-[#16c79a]/35 bg-[#16c79a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ip-compare-match"><CheckCircle2 className="h-3.5 w-3.5" /> {t.baseComponent}</span>;
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const partNumberHint = searchParams.get('pn') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedResults, setExpandedResults] = useState(false);
  const [expandedSpecs, setExpandedSpecs] = useState({});
  const [expandedMobileSpecs, setExpandedMobileSpecs] = useState({});
  const [expandedComparisonTable, setExpandedComparisonTable] = useState(false);
  const [expandedMobileComparisonTable, setExpandedMobileComparisonTable] = useState({});
  const [expandedBaseSpecs, setExpandedBaseSpecs] = useState(false);
  const { language, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    (async () => {
      try {
        const result = await compareIndustrialpedia(id, partNumberHint, 5);
        setData(result);
      } catch (e) { setError(e?.message || 'No se pudo ejecutar el comparador.'); }
    })();
  }, [id, partNumberHint, language]);

  const returnToFicha = () => {
    // Do not rely on browser history: the comparator can be opened directly,
    // inside a preview, or after a reload where history.back() has no useful route.
    // The route id is the exact base part id used to open this comparison.
    navigate(`/parte/${encodeURIComponent(id)}`, { replace: true });
  };

  if (!data && !error) return (
    <div className="min-h-screen bg-[#080d12]">
      <IndustrialpediaLoader fullScreen label={language === 'es' ? 'Buscando alternativas compatibles' : 'Searching compatible alternatives'} />
    </div>
  );
  if (error) return <div className="min-h-screen bg-[#080d12] flex flex-col items-center justify-center gap-3 text-white/50 text-sm"><p>{error}</p><button type="button" onClick={returnToFicha} className="ip-compare-accent">← Volver a ficha</button></div>;

  const base = data.base;
  const alternatives = data.alternatives || [];
  const notEvaluable = data.compatibility_evaluable === false || data.decision?.state === 'not_evaluable';
  const cols = [...alternatives, base];
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

  return <div className="ip-comparison ip-shell">
    <header className="ip-header">
      <div className="ip-container ip-header-inner">
        <button type="button" onClick={returnToFicha} className="rounded-lg border border-white/10 p-2 text-white/60 hover:text-white" aria-label="Volver a ficha"><ArrowLeft className="h-4 w-4" /></button>
        <div className="ip-brand"><span className="text-white">INDUSTRIAL</span><span className="text-[#168fd5]">PEDIA</span></div>
        <nav className="ip-nav hidden md:flex ml-4"><span className="ip-nav-item">{t.search}</span><span className="ip-nav-item ip-nav-item-active">{t.compare}</span><span className="ip-nav-item">Fabricantes</span><span className="ip-nav-item">Recursos</span></nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:inline rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55">{language.toUpperCase()}</span>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#65a9e6]/60"
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" strokeWidth={1.8} /> : <Moon className="h-5 w-5" strokeWidth={1.8} />}
          </button>
        </div>
      </div>
    </header>

    <main className="ip-container py-4 sm:py-7 min-w-0">
      <button type="button" onClick={returnToFicha} className="mb-4 flex items-center gap-2 text-xs ip-compare-accent hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Volver a ficha</button>
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
            <div className="mt-1 text-sm ip-compare-accent">{base.manufacturer_name || t.manufacturerNotIndicated}</div>
            <div className="mt-2 max-w-xl text-sm text-white/55">{base.product_name || base.description || ''}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {(base.specs || []).slice(0, expandedBaseSpecs ? base.specs.length : 6).map((s, i) => <div key={i}><div className="text-white/55">{propertyLabelFromSpec(s, language) }</div><div className="mt-1 font-mono text-base font-semibold text-white/90">{val(s, language)}</div></div>)}
          </div>
          {(base.specs || []).length > 6 && (
            <div className="mt-3 flex justify-center border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setExpandedBaseSpecs((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold text-[#65a9e6] hover:bg-[#65a9e6]/[0.08] transition-colors"
                aria-expanded={expandedBaseSpecs}
              >
                {expandedBaseSpecs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expandedBaseSpecs ? 'Ver menos' : `Ver más · ${base.specs.length - 6} datos`}
              </button>
            </div>
          )}
        </div>
      </section>

      <>
        <section className="mb-4 rounded-xl border border-white/10 bg-[#0d141b] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold text-white/95">{t.compatibilityMap}</h2><p className="mt-1 text-sm leading-relaxed text-white/65">Primero se muestran las piezas candidatas; después se comparan sus fichas técnicas propiedad por propiedad contra el componente base.</p></div>
            <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-white/25">BASE → ALTERNATIVAS</span>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-[#16c79a]/30 bg-[#16c79a]/[0.04] p-3 lg:sticky lg:top-4 lg:self-start">
              {base.image_url && <img src={base.image_url} alt="" className="h-14 w-14 shrink-0 rounded-md object-contain bg-white p-1" referrerPolicy="no-referrer" />}
              <div className="min-w-0"><div className="text-[9px] font-bold uppercase tracking-wider ip-compare-match">{t.baseComponent}</div><div className="mt-1 truncate font-mono text-xs font-semibold text-white">{base.part_number}</div><div className="mt-1 truncate text-sm text-white/60">{base.manufacturer_name || t.manufacturerNotIndicated}</div></div>
            </div>
            <div className="hidden items-center justify-center lg:flex text-white/20">→</div>
            <div className="grid min-w-0 flex-[2] gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {alternatives.map((c, i) => {
            const meta = statusMeta(c, t); const equal = c.comparison?.equal || 0; const compared = c.comparison?.compared || 0;
            const evidence = evidenceSummary(c, language);
            const visualState = decisionVisualState(c);
            const visual = DECISION_VISUAL[visualState];
            return <div key={i} className={`rounded-xl border p-4 ${meta.cls}`}>
              <div className="flex items-center justify-between gap-2"><span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider`}><span className={`h-2.5 w-2.5 rounded-full ${visual.dot}`} />{visual.label}</span><span className="font-mono text-xs font-semibold">{equal}/{compared} {t.specsShort}</span></div>
              <div className="mt-2 text-sm font-medium text-white/65">{visualState === 'compatible' ? `${equal} datos coinciden` : visualState === 'not_compatible' ? `${evidence.different.length} diferencias críticas` : `${equal} datos coinciden · ${evidence.different.length} diferentes`}</div>
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
                <div className="flex items-center justify-between gap-2"><div className="text-sm font-bold uppercase tracking-wider text-white/55">Ficha técnica</div><div className="text-[9px] font-mono text-white/25">{c.specs.length} datos</div></div>
                <div className="mt-2 grid grid-cols-1 gap-2 2xl:grid-cols-2">
                  {c.specs.slice(0, expandedSpecs[c.id || i] ? c.specs.length : 6).map((s, j) => {
                    const baseSpec = (base.specs || []).find((b) => canonical(b) === canonical(s));
                    const propertyState = baseSpec ? stateFor(baseSpec, c) : 'candidate_only';
                    const isIncompatible = propertyState === 'different' && c.comparison?.state === 'not_compatible';
                    const valueTone = propertyState === 'equal' ? 'ip-compare-match' : isIncompatible ? 'ip-compare-danger' : propertyState === 'different' ? 'ip-compare-warning' : 'text-white/55';
                    const valueBg = propertyState === 'equal' ? 'bg-[#16c79a]/[0.06]' : isIncompatible ? 'bg-red-400/[0.06]' : propertyState === 'different' ? 'bg-amber-400/[0.06]' : '';
                    const indicator = propertyState === 'equal' ? '🟢' : isIncompatible ? '🔴' : propertyState === 'different' ? '🟡' : '⚪';
                    const baseValueForCard = baseSpec ? val(baseSpec, language) : '—';
                    return <div key={j} className={`min-w-0 rounded-md border border-white/[0.04] px-2.5 py-2 ${valueBg}`}>
                      <div className="flex items-center gap-1.5"><span className="text-[10px]" aria-hidden="true">{indicator}</span><div className="truncate text-[11px] font-medium text-white/55">{propertyLabelFromSpec(s, language)}</div></div>
                      <div className="mt-2 grid grid-cols-2 gap-2" dir="ltr">
                        <div className={`min-w-0 rounded border border-white/[0.06] px-2 py-1.5 ${valueBg}`}>
                          <div className="truncate text-[9px] font-semibold uppercase tracking-wider text-white/45" title={`Comparativa · ${c.part_number}`}>Comparativa · {c.part_number}</div>
                          <div className={`mt-0.5 break-words font-mono text-[13px] font-semibold leading-relaxed ${valueTone}`}>{val(s, language)}</div>
                        </div>
                        <div className="min-w-0 rounded border border-white/[0.06] bg-[#65a9e6]/[0.035] px-2 py-1.5">
                          <div className="truncate text-[9px] font-semibold uppercase tracking-wider text-white/40" title={`Original · ${base.part_number}`}>Original · {base.part_number}</div>
                          <div className="mt-0.5 break-words font-mono text-[13px] font-semibold leading-relaxed text-white/85">{baseValueForCard}</div>
                        </div>
                      </div>
                    </div>;
                  })}
                </div>
                {c.specs.length > 6 && <div className="mt-2 flex justify-center border-t border-white/[0.06] pt-2">
                  <button type="button" onClick={() => setExpandedSpecs((current) => ({ ...current, [c.id || i]: !current[c.id || i] }))} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold text-[#65a9e6] hover:bg-[#65a9e6]/[0.08] transition-colors" aria-expanded={!!expandedSpecs[c.id || i]}>
                    {expandedSpecs[c.id || i] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {expandedSpecs[c.id || i] ? 'Ver menos' : `Ver más · ${c.specs.length - 6} datos`}
                  </button>
                </div>}
              </div>}
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                <span className="text-sm text-white/55">Resultado</span>
                <span className="text-base font-semibold text-white/90">{meta.short}</span>
              </div>
            </div>;
          })}
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-xl border border-white/10 bg-[#0d141b] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[#65a9e6]" />
            <div><h2 className="text-base font-semibold text-white/95">Fichas técnicas comparadas</h2><p className="mt-1 text-sm leading-relaxed text-white/65">Aquí se ve exactamente qué dato de la ficha de cada fabricante coincide, difiere o falta.</p></div>
          </div>
        </section>
        {/* En móvil no obligamos al usuario a adivinar qué columna está viendo.
            La tabla completa sigue disponible en desktop/tablet, pero en teléfono
            mostramos una matriz apilada por alternativa con los mismos datos y estados. */}
        <div className="mb-4 md:hidden space-y-3">
          {alternatives.map((c, ci) => {
            const mobileRows = specRows.map((s) => {
              const originalValue = s.original_value !== null && s.original_value !== undefined && s.original_value !== ''
                ? val(s, language)
                : '—';
              const candidate = valueFor(s, c);
              const state = stateFor(s, c);
              const candidateValue = candidate !== null && candidate !== undefined && candidate !== ''
                ? (typeof candidate === 'object' ? val(candidate, language) : normalizeTechnicalNotation(candidate, { language }))
                : '—';
              return { s, originalValue, candidateValue, state };
            }).filter((row) => row.originalValue !== '—' || row.candidateValue !== '—');
            const mobileKey = c.id || ci;
            const visible = mobileRows.slice(0, expandedMobileComparisonTable[mobileKey] ? mobileRows.length : 6);
            return (
              <section key={c.id || ci} className="rounded-xl border border-white/10 bg-[#0d141b] overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] p-3">
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-white/30">{t.alternatives || 'Alternativa'}</div>
                    <div className="mt-1 font-mono text-sm font-semibold ip-compare-accent break-all">{c.part_number}</div>
                    <div className="mt-0.5 text-[10px] text-white/40">{c.manufacturer_name || t.manufacturerNotIndicated}</div>
                  </div>
                  <div className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${statusMeta(c, t).cls}`}>
                    {statusMeta(c, t).label}
                  </div>
                </div>
                <div className="px-3 py-2 text-[9px] text-white/30 border-b border-white/[0.06]">
                  <span className="text-white/50">Comparativa:</span> {c.part_number} · <span className="text-white/50">Original:</span> {base.part_number}
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {visible.map(({ s, originalValue, candidateValue, state }, j) => {
                    const valueClass = state === 'equal'
                      ? 'ip-compare-match'
                      : state === 'different'
                        ? (c.comparison?.state === 'not_compatible' ? 'ip-compare-danger' : 'ip-compare-warning')
                        : state === 'not_comparable'
                          ? 'ip-compare-danger'
                          : 'text-white/35';
                    const stateIcon = state === 'equal' ? '✓' : state === 'different' ? '⚠' : state === 'not_comparable' ? '✕' : '○';
                    return (
                      <div key={`${s.attribute_name}-${j}`} className="grid grid-cols-[1fr_auto] gap-3 p-3">
                        <div className="min-w-0">
                          <div className="text-[10px] text-white/45">{propertyLabelFromSpec(s, language)}</div>
                          <div className="mt-1 grid grid-cols-2 gap-2" dir="ltr">
                            <div className={`min-w-0 rounded-md px-2 py-1.5 ${state === 'equal' ? 'bg-[#16c79a]/[0.06]' : state === 'different' ? (c.comparison?.state === 'not_compatible' ? 'bg-red-400/[0.06]' : 'bg-amber-400/[0.06]') : state === 'not_comparable' ? 'bg-red-400/[0.06]' : 'bg-white/[0.025]'}`}>
                              <div className="text-[8px] uppercase tracking-wider text-white/45">Comparativa · {c.part_number}</div>
                              <div className={`mt-0.5 break-words font-mono text-[10px] font-semibold ${valueClass}`}>{candidateValue}</div>
                            </div>
                            <div className="min-w-0 rounded-md bg-[#65a9e6]/[0.035] px-2 py-1.5">
                              <div className="text-[8px] uppercase tracking-wider text-white/40">Original · {base.part_number}</div>
                              <div className="mt-0.5 break-words font-mono text-[10px] text-white/85">{originalValue}</div>
                            </div>
                          </div>
                        </div>
                        <div className={`pt-5 text-xs font-bold ${valueClass}`} aria-label={state}>{stateIcon}</div>
                      </div>
                    );
                  })}
                </div>
                {mobileRows.length > 6 && <div className="flex justify-center border-t border-white/[0.06] py-2">
                  <button type="button" onClick={() => setExpandedMobileComparisonTable((current) => ({ ...current, [mobileKey]: !current[mobileKey] }))} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold text-[#65a9e6] hover:bg-[#65a9e6]/[0.08] transition-colors" aria-expanded={!!expandedMobileComparisonTable[mobileKey]}>
                    {expandedMobileComparisonTable[mobileKey] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {expandedMobileComparisonTable[mobileKey] ? 'Ver menos' : `Ver más · ${mobileRows.length - 6} datos`}
                  </button>
                </div>}

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
                  <div className="min-w-0"><div className="font-mono text-base font-semibold ip-compare-accent break-all">{c.part_number}</div><div className="mt-1 text-sm text-white/60">{c.manufacturer_name || t.manufacturerNotIndicated}</div><div className="mt-1 line-clamp-2 text-sm leading-relaxed text-white/65">{c.product_name || c.description || ''}</div></div>
                </div>
              </div>)}
            </div>

            {specRows.slice(0, expandedComparisonTable ? specRows.length : 6).map((s, idx) => <div key={`${s.attribute_name}-${idx}`} className="grid" style={{gridTemplateColumns:`170px repeat(${cols.length}, minmax(210px, 1fr))`}}>
              <div className="border-t border-white/[0.06] p-3 text-xs text-white/55">{propertyLabelFromSpec(s, language) }</div>
              {cols.map((c, ci) => {
                const isBaseColumn = c.id === base.id;
                const candidate = isBaseColumn ? s : valueFor(s, c);
                const st = isBaseColumn ? 'base' : stateFor(s, c);
                const normalized = isBaseColumn ? null : normalizedFor(s, c);
                const normalizedDisplay = normalizedDisplayFor(normalized, language);
                const hasCandidateValue = candidate !== null && candidate !== undefined && candidate !== '';
                const display = hasCandidateValue ? (typeof candidate === 'object' ? val(candidate, language) : normalizeTechnicalNotation(candidate, { language })) : '—';
                const stateClass = st === 'equal' ? 'ip-compare-match' : st === 'different' ? 'ip-compare-warning' : st === 'not_comparable' ? 'ip-compare-danger' : 'text-white/35';
                const stateBg = st === 'equal' ? 'bg-[#16c79a]/[0.06]' : st === 'different' ? 'bg-amber-400/[0.06]' : st === 'not_comparable' ? 'bg-red-400/[0.06]' : '';
                return <div key={ci} className={`flex min-w-0 items-center justify-between gap-2 overflow-hidden border-l border-t border-white/[0.06] p-3 text-xs ${stateClass} ${stateBg}`}>
                  <div className="min-w-0"><div className="font-mono text-sm leading-relaxed whitespace-normal break-words [overflow-wrap:anywhere]">{display}</div>{normalizedDisplay && <div className="mt-1 text-xs font-mono text-white/50 whitespace-normal break-words [overflow-wrap:anywhere]">{language === 'es' ? 'Normalizado' : language === 'de' ? 'Normalisiert' : language === 'fr' ? 'Normalisé' : language === 'zh' ? '标准化' : 'Normalized'}: {normalizedDisplay}</div>}</div>
                  {!isBaseColumn && (st === 'equal' ? <CheckCircle2 className="h-4 w-4 shrink-0 ip-compare-match" /> : st === 'different' ? <AlertTriangle className="h-4 w-4 shrink-0 ip-compare-warning" /> : st === 'not_comparable' ? <XCircle className="h-4 w-4 shrink-0 ip-compare-danger" /> : <span className="text-white/20">—</span>)}
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
              className="mt-1 rounded-lg border border-[#65a9e6]/35 bg-[#65a9e6]/[0.08] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider ip-compare-accent hover:bg-[#65a9e6]/[0.14] disabled:opacity-50"
            >{t.moreAlternatives}</button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-white/45">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 ip-compare-match" /> {STATUS_LABELS_ES.equal}</span>
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 ip-compare-warning" /> {STATUS_LABELS_ES.different} (revisar)</span>
          <span className="flex items-center gap-1.5"><X className="h-3.5 w-3.5 ip-compare-danger" /> No coincide</span>
          <span className="flex items-center gap-1.5"><span className="text-white/30">○</span> No especificado</span>
        </div>
        <p className="mt-3 text-[10px] text-white/30">La comparación muestra todos los datos técnicos disponibles para cada componente. El límite de 5 alternativas solo controla cuántas piezas se muestran inicialmente, no cuántas especificaciones técnicas se comparan. La comparación usa únicamente datos del Knowledge Core. “Compatible” solo se declara cuando las reglas de familia y los requisitos disponibles permiten demostrarlo; datos críticos faltantes llevan a revisión.</p>
      </>
    </main>
  </div>;
}