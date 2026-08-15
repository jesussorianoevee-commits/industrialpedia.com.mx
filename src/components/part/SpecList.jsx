import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, AlertCircle, FileText, Link2 } from 'lucide-react';

function SpecRow({ spec, evidence, provenance }) {
  const hasEvidence = evidence.length > 0;
  const verified = hasEvidence && (spec.validation_state === 'published' || spec.validation_state === 'validated');
  return (
    <div className="bg-[#161a20] border border-white/10 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-white font-medium text-sm">{spec.attribute_canonical || spec.attribute_name}</div>
          <div className="text-white/40 text-[11px]">{spec.attribute_name}</div>
        </div>
        {verified ? (
          <span className="flex items-center gap-1 text-[#47bcb6] text-[11px]"><ShieldCheck className="w-3.5 h-3.5" /> verificado</span>
        ) : (
          <span className="flex items-center gap-1 text-[#e68a00] text-[11px]"><AlertCircle className="w-3.5 h-3.5" /> sin evidencia</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
        <div>
          <div className="text-white/30 text-[10px] uppercase tracking-wide">Original</div>
          <div className="text-white/70">{spec.original_value}{spec.original_unit ? ` ${spec.original_unit}` : ''}</div>
        </div>
        <div>
          <div className="text-white/30 text-[10px] uppercase tracking-wide">Normalizado</div>
          <div className="text-white/70">{spec.normalized_value || '—'}{spec.normalized_unit ? ` ${spec.normalized_unit}` : ''}</div>
        </div>
      </div>

      {hasEvidence && (
        <div className="border-t border-white/10 pt-2 mt-2 space-y-1">
          {evidence.map((ev, i) => (
            <div key={ev.id || i} className="flex items-start gap-2 text-[11px] text-white/50">
              <FileText className="w-3 h-3 mt-0.5 shrink-0 text-white/40" />
              <span className="line-clamp-2">"{ev.raw_text}"{ev.page ? ` · pág. ${ev.page}` : ''}{ev.rule_id ? ` · regla ${ev.rule_id}` : ''}</span>
            </div>
          ))}
        </div>
      )}
      {provenance.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-white/30 mt-2">
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
    <div className="space-y-3">
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