import { X, FileText, ShieldCheck, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { Image } from '@/components/ui/image';

const SOURCE_TYPE_LABELS = {
  official: 'Fabricante oficial',
  distributor: 'Distribuidor',
  cse_configured: 'Fuente web'
};

function SourceBadge({ page, verified }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono shrink-0 ${verified
      ? 'border-[#47bcb6]/20 text-[#47bcb6]/80 bg-[#47bcb6]/5'
      : 'border-white/10 text-white/35 bg-white/[0.02]'}`}>
      {verified ? 'VERIFICADA' : page ? `pág. ${page}` : 'S/F'}
    </span>
  );
}

function SpecRow({ label, value, unit, page, verified, sourceUrl }) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const text = `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-4 py-4 border-b border-white/[0.055] last:border-b-0">
      <div className="flex items-start gap-2 min-w-0">
        <span className="text-[14px] sm:text-[15px] leading-6 text-white/55 font-mono break-words">{label}</span>
        <SourceBadge page={page} verified={verified} />
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
            fuente <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function FichaIndustrialpedia({ ficha, loading, error, onClose }) {
  const specs = Array.isArray(ficha?.specs) ? ficha.specs : [];
  const grouped = Array.isArray(ficha?.specs_grouped) ? ficha.specs_grouped : [];
  const verifiedSpecs = Array.isArray(ficha?.knowledge_core_verified_specs) ? ficha.knowledge_core_verified_specs : [];
  const basicSpecs = Array.isArray(ficha?.basic_specs) ? ficha.basic_specs : [];
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
            <span className="text-sm font-semibold tracking-wide text-white">Ficha técnica</span>
          </div>
          <button onClick={onClose} className="text-white/45 hover:text-white p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 text-[#5a9cd9] animate-spin" />
            <p className="text-xs text-white/45">Construyendo ficha técnica…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 px-5">
            <AlertCircle className="w-6 h-6 text-amber-400" />
            <p className="text-sm text-white/70 text-center">{error}</p>
            <p className="text-[11px] text-white/35 text-center">No se pudo construir la ficha desde esta fuente.</p>
          </div>
        ) : !ficha ? null : (
          <div className="p-4 sm:p-6 space-y-6">
            <section className="rounded-xl border border-white/10 bg-[#10161d] p-5 sm:p-6">
              <div className="flex items-start gap-4">
                {ficha.image_url ? (
                  <Image
                    src={ficha.image_url}
                    alt=""
                    fittingType="fit"
                    className="h-24 w-24 sm:h-28 sm:w-28 rounded-xl bg-white shrink-0 border border-white/10"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-white/20" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {ficha.manufacturer_name && <div className="text-[11px] text-[#5a9cd9] font-medium uppercase tracking-[0.14em] truncate">{ficha.manufacturer_name}</div>}
                  <h1 className="mt-1 text-base sm:text-lg font-semibold text-white leading-snug">{ficha.product_name || ficha.part_number || 'Producto'}</h1>
                  {ficha.part_number && <div className="mt-1 text-xs font-mono text-white/55 break-all">{ficha.part_number}</div>}
                  {ficha.component_type_label && <div className="mt-2 text-[10px] uppercase tracking-wider text-white/35">{ficha.component_type_label}</div>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#47bcb6]/8 text-[#47bcb6]/85 border border-[#47bcb6]/15">
                  <ShieldCheck className="w-3 h-3" />
                  {verifiedSpecs.length ? 'Con especificaciones verificadas' : 'Encontrada en fuente · pendiente de verificación'}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/10 text-white/40">{sourceLabel}</span>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[#0f151b] overflow-hidden">
              <div className="px-5 sm:px-6 py-5 border-b border-white/10">
                <h2 className="text-[16px] sm:text-[17px] font-semibold tracking-[0.18em] text-white/75 font-mono">ESPECIFICACIONES</h2>
              </div>
              <div className="px-5 sm:px-6">
                {specs.length === 0 && grouped.length === 0 ? (
                  basicSpecs.length > 0 ? (
                    <div>
                      {basicSpecs.map((s, i) => (
                        <SpecRow key={`basic-${i}`} label={s.attribute} value={s.value} verified={false} sourceUrl={ficha.source?.url} />
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center text-xs text-white/35">No hay especificaciones técnicas aceptadas por el Quality Gateway.</div>
                  )
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
                  </>
                )}
              </div>
            </section>

            {verifiedSpecs.length > 0 && (
              <section className="rounded-xl border border-[#47bcb6]/15 bg-[#47bcb6]/[0.025] overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-[#47bcb6]/10 flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#47bcb6]" />
                  <h2 className="text-[11px] uppercase tracking-[0.16em] text-[#47bcb6]/80 font-semibold">Knowledge Core · verificadas</h2>
                </div>
                <div className="px-4 sm:px-5">
                  {verifiedSpecs.map((s, i) => (
                    <SpecRow
                      key={`verified-${i}`}
                      label={s.attribute_name || s.attribute}
                      value={s.normalized_value || s.original_value}
                      unit={s.normalized_unit || s.original_unit}
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
                  <div className="text-[10px] uppercase tracking-wider text-white/35">Fuente</div>
                  <div className="mt-1 text-xs text-white/60 truncate">{ficha.source?.domain || ficha.source?.url}</div>
                  {ficha.source?.is_pdf && <div className="mt-1 text-[10px] text-[#47bcb6]/75">Datasheet PDF</div>}
                </div>
                {ficha.source?.url && (
                  <a href={ficha.source.url} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1.5 text-xs text-[#5a9cd9] hover:underline">
                    Abrir fuente <ExternalLink className="w-3 h-3" />
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