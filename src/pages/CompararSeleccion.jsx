import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { compareSelectedParts } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { normalizeTechnicalNotation, canonicalTechnicalAttribute } from '../../base44/shared/technicalNotation.js';
import { useLanguage, localizeSpecAttributeStrict } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import IndustrialpediaLoader from '@/components/ui/IndustrialpediaLoader';
import { normalizeImageUrl } from '@/lib/productImage';
import { useComparisonSelection } from '@/lib/comparisonSelection';

// Mismas funciones puras de lectura de specs que Comparar.jsx -- comparten
// forma de datos (misma respuesta de compare_parts_batch_public_v1) pero
// esta vista compara piezas elegidas a mano, no un base + alternativas
// autodescubiertas, así que vive como página aparte en vez de forzar ambos
// flujos dentro del mismo componente.
const LEVEL_LABELS_ES = { min: 'Mín', max: 'Máx' };
function canonical(s) { return canonicalTechnicalAttribute(s?.attribute_name || s?.attribute_canonical || s?.attribute || ''); }
function comparisonFor(base, alt) { const differences = Array.isArray(alt?.comparison?.differences) ? alt.comparison.differences : []; return differences.find((d) => canonical(d) === canonical(base)) || null; }
function stateFor(base, alt) { const hit = comparisonFor(base, alt); if (hit?.state) return hit.state; return (alt?.specs || []).some((s) => canonical(s) === canonical(base)) ? 'not_comparable' : 'base_only'; }
function valueFor(base, alt) { const hit = comparisonFor(base, alt); if (hit && hit.candidate !== null && hit.candidate !== undefined && hit.candidate !== '') return hit.candidate; return (alt?.specs || []).find((s) => canonical(s) === canonical(base)); }
function normalizedFor(base, alt) { const hit = comparisonFor(base, alt); return hit && hit.normalized_b !== null && hit.normalized_b !== undefined ? { value: hit.normalized_b, unit: hit.normalized_unit } : null; }
function val(s, language = 'es') { const raw = s?.original_value ?? s?.raw_value ?? ''; const original = `${raw}${s?.original_unit ? ` ${s.original_unit}` : ''}`.trim(); const normalized = s?.normalized_value; const unit = s?.normalized_unit || ''; const rendered = normalized !== null && normalized !== undefined && normalized !== '' && String(normalized) !== String(raw) ? `${original || raw || '—'} → ${normalized}${unit ? ` ${unit}` : ''}` : (original || (normalized !== null && normalized !== undefined ? `${normalized}${unit ? ` ${unit}` : ''}` : '') || '—'); return normalizeTechnicalNotation(rendered, { language }); }
function propertyLabelFromSpec(spec, language = 'es') {
  if (spec?.has_formal_label && spec?.attribute_canonical) return spec.attribute_canonical;
  return localizeSpecAttributeStrict(String(spec?.attribute_name || spec?.attribute || '').trim(), language);
}
function normalizedDisplayFor(normalized, language = 'es') {
  if (!normalized) return '';
  if (Array.isArray(normalized.value)) return normalized.value.map((item) => {
    const levelLabel = LEVEL_LABELS_ES[item?.level_type];
    const rendered = `${normalizeTechnicalNotation(item?.normalized_value ?? '—', { language })}${item?.normalized_unit ? ` ${item.normalized_unit}` : ''}`;
    return levelLabel ? `${localizeSpecAttributeStrict(levelLabel, language)}: ${rendered}` : rendered;
  }).join(' · ');
  return normalizeTechnicalNotation(normalized.unit ? `${normalized.value} ${normalized.unit}` : String(normalized.value), { language });
}

export default function CompararSeleccion() {
  const navigate = useNavigate();
  const { selected, remove } = useComparisonSelection();
  const { language, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expandedTable, setExpandedTable] = useState(false);
  const [expandedMobile, setExpandedMobile] = useState({});

  const ids = selected.map((p) => p.id);
  const idsKey = ids.join(',');

  useEffect(() => {
    if (ids.length < 2) { setData(null); setError(''); return; }
    let cancelled = false;
    setData(null);
    setError('');
    (async () => {
      try {
        const result = await compareSelectedParts(ids);
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'No se pudo ejecutar la comparación.');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const goBack = () => navigate(-1);

  if (ids.length < 2) return (
    <div className="ip-shell flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-white/55">Selecciona al menos 2 refacciones desde el buscador para compararlas aquí.</p>
      <button type="button" onClick={() => navigate('/buscar')} className="ip-button-primary">Ir al buscador</button>
    </div>
  );

  if (!data && !error) return (
    <div className="relative min-h-screen overflow-hidden bg-[#080d12] grid-bg">
      <div className="ip-scan-sweep" aria-hidden="true" />
      <IndustrialpediaLoader fullScreen label={language === 'es' ? 'Analizando especificaciones técnicas' : 'Analyzing technical specifications'} />
    </div>
  );

  if (error) return <div className="min-h-screen bg-[#080d12] flex flex-col items-center justify-center gap-3 text-white/50 text-sm"><p>{error}</p><button type="button" onClick={goBack} className="ip-compare-accent">← Volver</button></div>;

  const base = data.base;
  const alternatives = data.alternatives || [];
  const cols = [base, ...alternatives];
  const specRows = [...(base.specs || [])];
  const seenProperties = new Set(specRows.map((s) => canonical(s)));
  for (const alt of alternatives) {
    for (const diff of alt?.comparison?.differences || []) {
      if (diff?.state !== 'candidate_only') continue;
      const key = canonical(diff);
      if (!key || seenProperties.has(key)) continue;
      seenProperties.add(key);
      specRows.push({ attribute_name: diff.attribute_name || diff.attribute_canonical, attribute_canonical: diff.attribute_canonical || diff.attribute_name, original_value: null, original_unit: null });
    }
  }

  return <div className="ip-comparison ip-shell">
    <header className="ip-header">
      <div className="ip-container ip-header-inner">
        <button type="button" onClick={goBack} className="rounded-lg border border-white/10 p-2 text-white/60 hover:text-white" aria-label="Volver"><ArrowLeft className="h-4 w-4" /></button>
        <div className="ip-brand"><span className="text-white">INDUSTRIAL</span><span className="text-[#168fd5]">PEDIA</span></div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={toggleTheme} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white/70 hover:bg-white/[0.06] hover:text-white" aria-label="Cambiar tema">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </div>
    </header>

    <main className="ip-container py-4 sm:py-7 min-w-0">
      <button type="button" onClick={goBack} className="mb-4 flex items-center gap-2 text-xs ip-compare-accent hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Volver</button>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Comparación de piezas seleccionadas</h1>
        <p className="mt-1 text-sm text-white/45">{cols.length} piezas de tu bandeja de comparación, ficha técnica propiedad por propiedad.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {selected.map((p, i) => (
          <span key={p.id} className="ip-card inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs">
            <span className="font-mono font-semibold">{p.part_number || '—'}</span>
            {i === 0 && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">Referencia</span>}
            {selected.length > 2 && <button type="button" onClick={() => remove(p.id)} aria-label={`Quitar ${p.part_number}`} className="text-white/30 hover:text-white/70"><X className="h-3 w-3" /></button>}
          </span>
        ))}
      </div>

      <div className="mb-4 md:hidden space-y-3">
        {alternatives.map((c, ci) => {
          const mobileRows = specRows.map((s) => {
            const originalValue = s.original_value !== null && s.original_value !== undefined && s.original_value !== '' ? val(s, language) : '—';
            const candidate = valueFor(s, c);
            const state = stateFor(s, c);
            const candidateValue = candidate !== null && candidate !== undefined && candidate !== '' ? (typeof candidate === 'object' ? val(candidate, language) : normalizeTechnicalNotation(candidate, { language })) : '—';
            return { s, originalValue, candidateValue, state };
          }).filter((row) => row.originalValue !== '—' || row.candidateValue !== '—');
          const mobileKey = c.id || ci;
          const visible = mobileRows.slice(0, expandedMobile[mobileKey] ? mobileRows.length : 6);
          return (
            <section key={c.id || ci} className="ip-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] p-3">
                <div className="min-w-0"><div className="mt-1 font-mono text-sm font-semibold ip-compare-accent break-all">{c.part_number}</div><div className="mt-0.5 text-[10px] text-white/40">{c.manufacturer_name || t.manufacturerNotIndicated}</div></div>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {visible.map(({ s, originalValue, candidateValue, state }, j) => {
                  const valueClass = state === 'equal' ? 'ip-compare-match' : state === 'different' ? 'ip-compare-warning' : state === 'not_comparable' ? 'ip-compare-danger' : 'text-white/35';
                  const stateIcon = state === 'equal' ? '✓' : state === 'different' ? '⚠' : state === 'not_comparable' ? '✕' : '○';
                  return (
                    <div key={`${s.attribute_name}-${j}`} className="grid grid-cols-[1fr_auto] gap-3 p-3">
                      <div className="min-w-0">
                        <div className="text-[10px] text-white/45">{propertyLabelFromSpec(s, language)}</div>
                        <div className="mt-1 grid grid-cols-2 gap-2" dir="ltr">
                          <div className={`min-w-0 rounded-md px-2 py-1.5 ${state === 'equal' ? 'bg-[#16c79a]/[0.06]' : state === 'different' ? 'bg-amber-400/[0.06]' : state === 'not_comparable' ? 'bg-red-400/[0.06]' : 'bg-white/[0.025]'}`}>
                            <div className="text-[8px] uppercase tracking-wider text-white/45">{c.part_number}</div>
                            <div className={`mt-0.5 break-words font-mono text-[10px] font-semibold ${valueClass}`}>{candidateValue}</div>
                          </div>
                          <div className="min-w-0 rounded-md bg-primary/[0.035] px-2 py-1.5">
                            <div className="text-[8px] uppercase tracking-wider text-white/40">{base.part_number}</div>
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
                <button type="button" onClick={() => setExpandedMobile((cur) => ({ ...cur, [mobileKey]: !cur[mobileKey] }))} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold text-primary hover:bg-primary/[0.08]">
                  {expandedMobile[mobileKey] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {expandedMobile[mobileKey] ? 'Ver menos' : `Ver más · ${mobileRows.length - 6} datos`}
                </button>
              </div>}
            </section>
          );
        })}
      </div>

      <div className="hidden md:block ip-scroll-x ip-card overflow-hidden shadow-xl shadow-black/15">
        <div className="min-w-[820px]">
          <div className="grid" style={{ gridTemplateColumns: `170px repeat(${cols.length}, minmax(210px, 1fr))` }}>
            <div className="ip-sticky-col p-4 text-[10px] uppercase tracking-wider text-white/30" style={{ left: 0 }}>Especificaciones</div>
            {cols.map((c, i) => {
              const isBaseColumn = c.id === base.id;
              return <div key={i} className={`border-l p-4 ${isBaseColumn ? 'ip-sticky-col border-white/[0.08]' : 'border-white/[0.08]'}`} style={isBaseColumn ? { left: 170 } : undefined}>
                {isBaseColumn && <div className="mb-2 inline-flex items-center gap-1 rounded-md border border-[#16c79a]/35 bg-[#16c79a]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ip-compare-match"><CheckCircle2 className="h-3 w-3" /> Referencia</div>}
                <div className="flex items-start gap-3">
                  <div className="ip-thumb-frame flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                    {normalizeImageUrl(c.image_url) ? <img src={normalizeImageUrl(c.image_url)} alt={c.part_number || ''} className="h-full w-full object-contain p-1" referrerPolicy="no-referrer" /> : <span className="text-[8px] text-black/35">Sin imagen</span>}
                  </div>
                  <div className="min-w-0"><div className="font-mono text-base font-semibold ip-compare-accent break-all">{c.part_number}</div><div className="mt-1 text-sm text-white/60">{c.manufacturer_name || t.manufacturerNotIndicated}</div></div>
                </div>
              </div>;
            })}
          </div>

          {specRows.slice(0, expandedTable ? specRows.length : 8).map((s, idx) => <div key={`${s.attribute_name}-${idx}`} className="grid" style={{ gridTemplateColumns: `170px repeat(${cols.length}, minmax(210px, 1fr))` }}>
            <div className="ip-sticky-col border-t border-white/[0.06] p-3 text-xs text-white/55" style={{ left: 0 }}>{propertyLabelFromSpec(s, language)}</div>
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
              return <div key={ci} className={`flex min-w-0 items-center justify-between gap-2 overflow-hidden border-l border-t border-white/[0.06] p-3 text-xs ${stateClass} ${stateBg} ${st === 'different' ? 'ip-diff-alert' : ''} ${isBaseColumn ? 'ip-sticky-col' : ''}`} style={isBaseColumn ? { left: 170 } : undefined}>
                <div className="min-w-0"><div className="font-mono text-sm leading-relaxed whitespace-normal break-words [overflow-wrap:anywhere]">{display}</div>{normalizedDisplay && <div className="mt-1 text-xs font-mono text-white/50 whitespace-normal break-words [overflow-wrap:anywhere]">Normalizado: {normalizedDisplay}</div>}</div>
                {!isBaseColumn && (st === 'equal' ? <CheckCircle2 className="h-4 w-4 shrink-0 ip-compare-match" /> : st === 'different' ? <AlertTriangle className="h-4 w-4 shrink-0 ip-compare-warning" /> : st === 'not_comparable' ? <XCircle className="h-4 w-4 shrink-0 ip-compare-danger" /> : <span className="text-white/20">—</span>)}
              </div>;
            })}
          </div>)}
        </div>
      </div>
      {specRows.length > 8 && (
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={() => setExpandedTable((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold text-primary hover:bg-primary/[0.08]">
            {expandedTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expandedTable ? 'Ver menos' : `Ver más · ${specRows.length - 8} datos`}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-white/45">
        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 ip-compare-match" /> Igual</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 ip-compare-warning" /> Diferente (revisar)</span>
        <span className="flex items-center gap-1.5"><X className="h-3.5 w-3.5 ip-compare-danger" /> No coincide</span>
        <span className="flex items-center gap-1.5"><span className="text-white/30">○</span> No especificado</span>
      </div>
      <p className="mt-3 text-[10px] text-white/30">Comparación entre piezas seleccionadas manualmente desde el buscador. Usa únicamente datos del Knowledge Core; datos críticos faltantes no se inventan.</p>
    </main>
  </div>;
}
