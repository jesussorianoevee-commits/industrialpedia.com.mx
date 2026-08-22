import { useEffect, useState } from 'react';
import { X, FileText, ShieldCheck, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { useLanguage, localizeSpecAttribute } from '@/lib/i18n';

const SOURCE_TYPE_LABELS = {
  official: 'Fabricante oficial',
  distributor: 'Distribuidor',
  cse_configured: 'Fuente web'
};

function isDisplayableSpec(spec) {
  const attribute = String(spec?.attribute_name || spec?.attribute || spec?.label || '').trim();
  const value = String(spec?.original_value || spec?.normalized_value || spec?.value || '').trim();
  const combined = `${attribute} ${value}`;
  if (!attribute || !value) return false;
  // Datos comerciales/logísticos no son especificaciones técnicas de la refacción.
  // No deben aparecer en la ficha aunque una fuente los entregue como pares
  // atributo/valor (por ejemplo: Stock 00062920 in).
  if (/^(?:stock|inventory|availability|available|in stock|out of stock|quantity|qty|price|cost|msrp|list price|sale price|lead time|delivery|shipping|order status|cart|sku)$/i.test(attribute)) return false;
  // Defensa de UI: nunca renderizar recursos, Markdown, URLs, código o rutas de
  // assets aunque una ficha histórica haya sido generada antes del saneador.
  if (/!\[[^\]]*\]|\]\(|(?:https?:)?\/\/|javascript\s*:|void\s*\(\s*0\s*\)|blob:\/\/|data:(?:text|image)\//i.test(combined)) return false;
  if (/^(?:\/|\.\/|\.\.\/).*(?:\.(?:svg|gif|png|jpe?g|webp|ico)(?:[?#].*)?)$/i.test(value)) return false;
  if (/(?:logo|logotype|brandmark|banner|favicon|navbar|navigation|search icon|location icon|contact icon|social icon|tracking pixel|sprite)/i.test(attribute) && /(?:\.(?:svg|gif|png|jpe?g|webp|ico)|\/images?\/|\/media\/|\/assets?\/)/i.test(value)) return false;
  return true;
}

function SourceBadge({ page, verified, t }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono shrink-0 ${verified
      ? 'border-[#47bcb6]/20 text-[#47bcb6]/80 bg-[#47bcb6]/5'
      : 'border-white/10 text-white/35 bg-white/[0.02]'}`}>
      {verified ? t.verified : page ? `${t.page} ${page}` : t.noSource}
    </span>
  );
}

function SpecRow({ label, value, unit, page, verified, sourceUrl, language, t }) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const text = `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-4 py-4 border-b border-white/[0.055] last:border-b-0">
      <div className="flex items-start gap-2 min-w-0">
        <span className="text-[14px] sm:text-[15px] leading-6 text-white/55 font-mono break-words">{localizeSpecAttribute(label, language)}</span>
        <SourceBadge page={page} verified={verified} t={t} />
      </div>
      <div className="min-w-0 text-right">
        <div className="text-[15px] sm:text-[16px] leading-6 text-white/90 font-mono break-words">{text}</div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-1 text-[10px] text-[#5a9cd9]/75 hover:text-[#5a9cd9]"
          >
            {t.source} <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function FichaIndustrialpedia({ ficha, loading, error, onClose }) {
  const { language, t } = useLanguage();
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    // Una ficha nueva no debe heredar el error de imagen de la ficha anterior.
    setImgError(false);
  }, [ficha?.image_url]);
  const specs = (Array.isArray(ficha?.specs) ? ficha.specs : []).filter(isDisplayableSpec);
  const grouped = (Array.isArray(ficha?.specs_grouped) ? ficha.specs_grouped : []).filter(isDisplayableSpec);
  const verifiedSpecs = (Array.isArray(ficha?.knowledge_core_verified_specs) ? ficha.knowledge_core_verified_specs : []).filter(isDisplayableSpec);
  const unverifiedSpecs = (Array.isArray(ficha?.unverified_specs) ? ficha.unverified_specs : []).filter(isDisplayableSpec);
  const basicSpecs = (Array.isArray(ficha?.basic_specs) ? ficha.basic_specs : []).filter(isDisplayableSpec);
  const specKeys = new Set([
    ...specs.map((s) => `${(s.attribute_name || s.attribute || '').toLowerCase()}|${String(s.normalized_value || s.original_value || '').toLowerCase()}`),
    ...unverifiedSpecs.map((s) => `${(s.attribute_name || s.attribute || '').toLowerCase()}|${String(s.normalized_value || s.original_value || '').toLowerCase()}`)
  ]);
  const extraBasic = basicSpecs.filter((s) => !specKeys.has(`${String(s.attribute || '').toLowerCase()}|${String(s.value || '').toLowerCase()}`));
  const sourceLabel = SOURCE_TYPE_LABELS[ficha?.source?.source_type] || SOURCE_TYPE_LABELS.cse_configured;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0b1015] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-[#0b1015]/95 backdrop-blur border-b border-white/10">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#5a9cd9]" />
            <span className="text-sm font-semibold tracking-wide text-white">{t.viewTechnicalSheet}</span>
          </div>
          <button onClick={onClose} className="text-white/45 hover:text-white p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 text-[#5a9cd9] animate-spin" />
            <p className="text-xs text-white/45">{t.creatingSheet}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 px-5">
            <AlertCircle className="w-6 h-6 text-amber-400" />
            <p className="text-sm text-white/70 text-center">{error}</p>
            <p className="text-[11px] text-white/35 text-center">{t.foundSourceNoPart}</p>
          </div>
        ) : !ficha ? null : (
          <div className="p-4 sm:p-6 space-y-6">
            <section className="rounded-xl border border-white/10 bg-[#10161d] p-5 sm:p-6">
              <div className="flex items-start gap-4">
                {ficha.image_url && !imgError ? (
                  <img
                    src={ficha.image_url}
                    alt=""
                    className="h-24 w-24 sm:h-28 sm:w-28 rounded-xl bg-white shrink-0 border border-white/10 object-contain p-2"
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-white/20" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {ficha.product_identity?.manufacturer && <div className="text-[11px] text-[#5a9cd9] font-medium uppercase tracking-[0.14em] truncate">{ficha.product_identity.manufacturer}</div>}
                  <h1 className={`mt-1 text-base sm:text-lg font-semibold leading-snug ${ficha.product_identity?.identified === false ? 'text-white/50' : 'text-white'}`}>{ficha.product_identity?.short_description || ficha.product_name || ficha.part_number || 'Producto'}</h1>
                  {ficha.product_identity?.variants?.length > 1 && (
                    <div className="mt-1 text-[11px] text-amber-400/80">{ficha.product_identity.variants.length} variantes: {ficha.product_identity.variants.join(', ')}</div>
                  )}
                  {ficha.part_number && <div className="mt-1 text-xs font-mono text-white/55 break-all">{ficha.part_number}</div>}
                  {ficha.component_type_label && <div className="mt-2 text-[10px] uppercase tracking-wider text-white/35">{ficha.component_type_label}</div>}
                  {ficha.product_identity?.source_title && ficha.product_identity.source_title !== (ficha.product_identity?.short_description || '') && (
                    <div className="mt-2 text-[10px] text-white/25">{t.sourceTitle}: {ficha.product_identity.source_title}</div>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#47bcb6]/8 text-[#47bcb6]/85 border border-[#47bcb6]/15">
                  <ShieldCheck className="w-3 h-3" />
                  {verifiedSpecs.length ? t.verifiedSpecs : t.foundPendingVerification}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/10 text-white/40">{sourceLabel}</span>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[#0f151b] overflow-hidden">
              <div className="px-5 sm:px-6 py-5 border-b border-white/10">
                <h2 className="text-[16px] sm:text-[17px] font-semibold tracking-[0.18em] text-white/75 font-mono">{t.technicalSpecs}</h2>
              </div>
              <div className="px-5 sm:px-6">
                {specs.length === 0 && grouped.length === 0 && unverifiedSpecs.length === 0 && basicSpecs.length === 0 ? (
                  <div className="py-10 text-center text-xs text-white/35">{t.noTechnicalSpecsSource}</div>
                ) : (
                  <>
                    {specs.map((s, i) => (
                      <SpecRow
                        key={`${s.attribute_name || s.attribute}-${i}`}
                        label={s.attribute_name || s.attribute}
                        value={s.normalized_value || s.original_value}
                        unit={s.normalized_unit || s.original_unit}
                        page={s.page}
                        verified={Boolean(s.verified)}
                        sourceUrl={s.evidence?.source_url || ficha.source?.url}
                      />
                    ))}
                    {specs.length === 0 && grouped.map((g, i) => g.available ? (
                      <SpecRow
                        key={`group-${i}`}
                        label={g.label}
                        value={g.value}
                        unit={g.unit}
                        page={g.evidence?.page}
                        verified={false}
                        sourceUrl={g.evidence?.source_url || ficha.source?.url}
                      />
                    ) : null)}
                    {unverifiedSpecs.length > 0 && (
                      <div className="py-3 border-b border-white/[0.055]">
                        <span className="text-[10px] uppercase tracking-wider text-white/30">{t.extractedUnverified}</span>
                      </div>
                    )}
                    {unverifiedSpecs.map((s, i) => (
                      <SpecRow
                        key={`unverified-${i}`}
                        label={s.attribute_name || s.attribute}
                        value={s.normalized_value || s.original_value}
                        unit={s.normalized_unit || s.original_unit}
                        page={s.page}
                        verified={false}
                        sourceUrl={s.evidence?.source_url || ficha.source?.url}
                      />
                    ))}
                    {extraBasic.map((s, i) => (
                      <SpecRow key={`extra-${i}`} label={s.attribute} value={s.value} unit={undefined} page={undefined} verified={false} sourceUrl={ficha.source?.url} />
                    ))}
                  </>
                )}
              </div>
            </section>

            {verifiedSpecs.length > 0 && (
              <section className="rounded-xl border border-[#47bcb6]/15 bg-[#47bcb6]/[0.025] overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-[#47bcb6]/10 flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#47bcb6]" />
                  <h2 className="text-[11px] uppercase tracking-[0.16em] text-[#47bcb6]/80 font-semibold">Knowledge Core · {t.verified}</h2>
                </div>
                <div className="px-4 sm:px-5">
                  {verifiedSpecs.map((s, i) => (
                    <SpecRow
                      key={`verified-${i}`}
                      label={s.attribute_name || s.attribute}
                      value={s.normalized_value || s.original_value}
                      unit={s.normalized_unit || s.original_unit}
                      page={s.page}
                      verified
                      sourceUrl={ficha.source?.url}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-xl border border-white/10 bg-white/[0.015] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-white/35">{t.source}</div>
                  <div className="mt-1 text-xs text-white/60 truncate">{ficha.source?.domain || ficha.source?.url}</div>
                  {ficha.source?.is_pdf && <div className="mt-1 text-[10px] text-[#47bcb6]/75">Datasheet PDF</div>}
                </div>
                {ficha.source?.url && (
                  <a href={ficha.source.url} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1.5 text-xs text-[#5a9cd9] hover:underline">
                    {t.viewSource} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {ficha.evidence_note && <p className="mt-3 text-[10px] text-white/30 leading-relaxed">{ficha.evidence_note}</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}