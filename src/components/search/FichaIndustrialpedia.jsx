import { X, FileText, ShieldCheck, Globe, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { Image } from '@/components/ui/image';

const SOURCE_TYPE_LABELS = {
  official: { label: 'Fabricante oficial', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' },
  distributor: { label: 'Distribuidor', cls: 'text-[#5a9cd9] bg-[#5a9cd9]/10' },
  cse_configured: { label: 'Fuente CSE configurada', cls: 'text-white/60 bg-white/10' }
};

export default function FichaIndustrialpedia({ ficha, loading, error, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0e1216] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#0e1216]/95 backdrop-blur border-b border-white/10">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#5a9cd9]" />
            <span className="text-sm font-semibold text-white">Ficha Industrialpedia</span>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 text-[#5a9cd9] animate-spin" />
            <p className="text-xs text-white/50">Extrayendo datos técnicos de la fuente…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 px-4">
            <AlertCircle className="w-6 h-6 text-amber-400" />
            <p className="text-sm text-white/70 text-center">{error}</p>
            <p className="text-[11px] text-white/40 text-center">No se pudo construir la ficha desde esta fuente. Intenta con otra fuente o un datasheet PDF.</p>
          </div>
        ) : !ficha ? null : (
          <div className="p-4 space-y-5">
            {/* Estado de verificación */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${ficha.already_in_knowledge_core ? 'text-[#47bcb6] bg-[#47bcb6]/10' : 'text-[#e68a00] bg-[#e68a00]/10'}`}>
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{ficha.already_in_knowledge_core ? 'Parcialmente verificado en Knowledge Core' : 'Encontrado en fuente · pendiente de verificación'}</span>
            </div>

            {/* Encabezado */}
            <div className="flex gap-3">
              {ficha.image_url ? (
                <Image src={ficha.image_url} alt={ficha.product_name || ''} className="h-20 w-20 rounded-lg object-contain bg-white/5 shrink-0" />
              ) : (
                <div className="h-20 w-20 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-white/25" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {ficha.manufacturer_name && <div className="text-xs text-[#5a9cd9] font-medium uppercase tracking-wide truncate">{ficha.manufacturer_name}</div>}
                <div className="text-sm font-semibold text-white leading-snug">{ficha.product_name || ficha.part_number || 'Producto'}</div>
                {ficha.part_number && (
                  <div className="mt-0.5 text-xs font-mono text-white/60 truncate">{ficha.part_number}</div>
                )}
                <div className="mt-1 inline-block text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/55">{ficha.component_type_label}</div>
              </div>
            </div>

            {ficha.description && (
              <p className="text-xs text-white/55 leading-relaxed">{ficha.description}</p>
            )}

            {/* Fuente */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-white/40">Fuente</span>
                <span className={`text-[10px] px-2 py-0.5 rounded ${(SOURCE_TYPE_LABELS[ficha.source?.source_type] || SOURCE_TYPE_LABELS.cse_configured).cls}`}>
                  {(SOURCE_TYPE_LABELS[ficha.source?.source_type] || SOURCE_TYPE_LABELS.cse_configured).label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-white/70">
                <Globe className="w-3 h-3 text-white/40 shrink-0" />
                <span className="truncate">{ficha.source?.domain || ficha.source?.url}</span>
                <a href={ficha.source?.url} target="_blank" rel="noreferrer" className="ml-auto text-[#5a9cd9] hover:underline shrink-0 flex items-center gap-0.5">
                  Abrir <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {ficha.source?.is_pdf && (
                <div className="text-[10px] text-[#47bcb6] flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Datasheet PDF
                </div>
              )}
              <div className="text-[10px] text-white/30">Consultado: {new Date(ficha.source?.retrieved_date || Date.now()).toLocaleString()}</div>
            </div>

            {/* Especificaciones agrupadas por plantilla */}
            {ficha.specs_grouped?.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Especificaciones técnicas</div>
                <div className="space-y-1.5">
                  {ficha.specs_grouped.map((g, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 py-1.5 border-b border-white/5">
                      <span className="text-xs text-white/55 shrink-0">{g.label}</span>
                      {g.available ? (
                        <div className="text-right min-w-0">
                          <div className="text-xs text-white font-medium">{g.value}{g.unit ? ` ${g.unit}` : ''}</div>
                          {g.evidence && (
                            <div className="text-[10px] text-white/35 mt-0.5 flex items-center gap-1 justify-end">
                              {g.evidence.page ? <span>pág. {g.evidence.page}</span> : null}
                              <a href={g.evidence.source_url} target="_blank" rel="noreferrer" className="text-[#5a9cd9] hover:underline truncate max-w-[120px]">{g.evidence.source_url ? new URL(g.evidence.source_url).hostname : ''}</a>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-white/25 italic">No disponible</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Otras especificaciones */}
            {ficha.specs_other?.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Otras especificaciones encontradas</div>
                <div className="space-y-1.5">
                  {ficha.specs_other.map((s, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 py-1.5 border-b border-white/5">
                      <span className="text-xs text-white/55 shrink-0">{s.label}</span>
                      <div className="text-right min-w-0">
                        <div className="text-xs text-white font-medium">{s.value}{s.unit ? ` ${s.unit}` : ''}</div>
                        {s.evidence?.page && <div className="text-[10px] text-white/35">pág. {s.evidence.page}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Especificaciones verificadas en Knowledge Core */}
            {ficha.knowledge_core_verified_specs?.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#47bcb6] mb-2 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Verificadas en Knowledge Core
                </div>
                <div className="space-y-1.5">
                  {ficha.knowledge_core_verified_specs.map((s, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 py-1.5 border-b border-[#47bcb6]/10">
                      <span className="text-xs text-white/60 shrink-0">{s.attribute_name}</span>
                      <span className="text-xs text-[#47bcb6] font-medium">{s.normalized_value || s.original_value}{s.normalized_unit ? ` ${s.normalized_unit}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-white/35 leading-relaxed pt-1">{ficha.evidence_note}</p>
          </div>
        )}
      </div>
    </div>
  );
}