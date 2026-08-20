import { ShieldCheck, AlertCircle, FileText, Link2 } from 'lucide-react';

function SpecRow({ spec, evidence, provenance }) {
  const hasEvidence = evidence.length > 0;
  const verified = hasEvidence && (spec.validation_state === 'published' || spec.validation_state === 'validated');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.45fr)] items-center gap-2 min-h-[42px] px-1.5 border-b border-white/10 last:border-b-0">
      <div className="min-w-0 py-2">
        <span className="text-white/60 text-[12px] leading-tight break-words">{spec.attribute_canonical || spec.attribute_name}</span>
      </div>
      <span className={`text-[9px] px-1.5 py-0.5 rounded border border-dashed shrink-0 ${verified ? 'text-[#47bcb6]/80 border-[#47bcb6]/30' : 'text-white/30 border-white/15'}`}>
        {verified ? 'OK' : 'S/F'}
      </span>
      <div className="min-w-0 text-right py-2">
        <span className="text-white/85 text-[12px] leading-tight break-words">
          {spec.original_value ?? '—'}{spec.original_unit ? ` ${spec.original_unit}` : ''}
        </span>
        {spec.normalized_value != null && (
          <div className="text-[9px] text-white/35 mt-0.5">≈ {spec.normalized_value}{spec.normalized_unit ? ` ${spec.normalized_unit}` : ''}</div>
        )}
      </div>
      {(hasEvidence || provenance.length > 0) && (
        <div className="col-span-3 pb-1.5 pl-1 flex flex-wrap gap-2 text-[9px] text-white/35">
          {evidence.map((ev, i) => <span key={ev.id || i} className="inline-flex items-center gap-1"><FileText className="w-2.5 h-2.5" />{ev.raw_text}{ev.page ? ` · pág. ${ev.page}` : ''}</span>)}
          {provenance.length > 0 && <span className="inline-flex items-center gap-1"><Link2 className="w-2.5 h-2.5" />{provenance.map((p) => p.operation).join(' → ')}</span>}
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
    <div className="bg-[#11161c] border border-white/10 rounded-lg px-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.45fr)] gap-2 px-1.5 py-1.5 border-b border-white/10 text-[9px] uppercase tracking-wider text-white/30">
        <span>Especificación</span><span></span><span className="text-right">Valor</span>
      </div>
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