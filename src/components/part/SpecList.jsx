import { ShieldCheck, AlertCircle, FileText, Link2 } from 'lucide-react';

function SpecRow({ spec, evidence, provenance }) {
  const hasEvidence = evidence.length > 0;
  const verified = hasEvidence && (spec.validation_state === 'published' || spec.validation_state === 'validated');
  return (
    <div className="bg-[#161a20] border border-white/10 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-white/50 text-[10px] uppercase tracking-wide truncate">{spec.attribute_canonical || spec.attribute_name}</div>
          <div className="text-white text-sm font-medium truncate">
            {spec.original_value ?? '—'}{spec.original_unit ? ` ${spec.original_unit}` : ''}
          </div>
        </div>
        <div className="shrink-0">
          {verified ? (
            <span className="flex items-center gap-1 text-[#47bcb6] text-[10px]"><ShieldCheck className="w-3 h-3" /> verificado</span>
          ) : (
            <span className="flex items-center gap-1 text-[#e68a00]/75 text-[10px]"><AlertCircle className="w-3 h-3" /> sin evidencia</span>
          )}
        </div>
      </div>

      {spec.normalized_value != null && (
        <div className="text-[10px] text-white/35 mt-1">
          Normalizado: <span className="text-white/55">{spec.normalized_value}{spec.normalized_unit ? ` ${spec.normalized_unit}` : ''}</span>
        </div>
      )}

      {hasEvidence && (
        <div className="border-t border-white/10 pt-1.5 mt-1.5 space-y-1">
          {evidence.map((ev, i) => (
            <div key={ev.id || i} className="flex items-start gap-1.5 text-[10px] text-white/45">
              <FileText className="w-3 h-3 mt-0.5 shrink-0 text-white/35" />
              <span className="line-clamp-2">"{ev.raw_text}"{ev.page ? ` · pág. ${ev.page}` : ''}</span>
            </div>
          ))}
        </div>
      )}
      {provenance.length > 0 && (
        <div className="flex items-center gap-1.5 text-[9px] text-white/25 mt-1.5">
          <Link2 className="w-3 h-3" /> {provenance.map((p) => p.operation).join(' → ')}
        </div>
      )}
    </div>
  );
}

export default function SpecList({ specs, evidenceBySpec, provenanceBySpec }) {
  if (specs.length === 0) {
    return <p className="text-white/40 text-sm">Sin especificaciones registradas para este componente.</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {specs.map((s) => (
        <SpecRow
          key={s.id}
          spec={s}
          evidence={evidenceBySpec[s.id] || []}
          provenance={provenanceBySpec[s.id] || []}
        />
      ))}
    </div>
  );
}