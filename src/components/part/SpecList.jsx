import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Link2 } from 'lucide-react';
import { useLanguage, localizeSpecAttribute } from '@/lib/i18n';

function SpecRow({ spec, evidence, provenance, language }) {
  const hasEvidence = evidence.length > 0;
  const verified = hasEvidence && (spec.validation_state === 'published' || spec.validation_state === 'validated');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.45fr)] items-center gap-2 min-h-[42px] px-1.5 border-b border-white/10 last:border-b-0">
      <div className="min-w-0 py-2">
        <span className="text-white/60 text-[12px] leading-tight break-words">{localizeSpecAttribute(spec.attribute_canonical || spec.attribute_name, language)}</span>
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
          {evidence.map((ev, i) => <span key={ev.id || i} className="inline-flex items-center gap-1"><FileText className="w-2.5 h-2.5" />{ev.raw_text}{ev.page ? ` · ${language === 'es' ? 'pág.' : language === 'de' ? 'S.' : language === 'fr' ? 'p.' : language === 'zh' ? '页' : 'p.'} ${ev.page}` : ''}</span>)}
          {provenance.length > 0 && <span className="inline-flex items-center gap-1"><Link2 className="w-2.5 h-2.5" />{provenance.map((p) => p.operation).join(' → ')}</span>}
        </div>
      )}
    </div>
  );
}

export default function SpecList({ specs, evidenceBySpec, provenanceBySpec }) {
  const { language, t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const INITIAL_VISIBLE = 6;
  if (specs.length === 0) {
    return <p className="text-white/40 text-sm">{t.noTechnicalSpecsSource}</p>;
  }
  return (
    <div className="bg-[#11161c] border border-white/10 rounded-lg px-2">
      <button
        type="button"
        onClick={() => specs.length > INITIAL_VISIBLE && setExpanded((value) => !value)}
        className={`w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.45fr)] gap-2 px-1.5 py-1.5 border-b border-white/10 text-[9px] uppercase tracking-wider text-white/30 text-left ${specs.length > INITIAL_VISIBLE ? 'cursor-pointer hover:text-white/50 transition-colors' : 'cursor-default'}`}
        aria-expanded={expanded}
        disabled={specs.length <= INITIAL_VISIBLE}
      >
        <span className="flex items-center gap-1">
          {specs.length > INITIAL_VISIBLE && (expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
          {t.technicalSpecs}
        </span>
        <span></span><span className="text-right">{t.requiredValue}</span>
      </button>
      {specs.slice(0, expanded ? specs.length : INITIAL_VISIBLE).map((s) => (
        <SpecRow
          key={s.id}
          spec={s}
          evidence={evidenceBySpec[s.id] || []}
          provenance={provenanceBySpec[s.id] || []}
          language={language}
        />
      ))}
      {specs.length > INITIAL_VISIBLE && (
        <div className="flex justify-center border-t border-white/10 py-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold text-[#65a9e6] hover:bg-[#65a9e6]/[0.08] transition-colors focus:outline-none focus:ring-1 focus:ring-[#65a9e6]/60"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? 'Ver menos' : `Ver más · ${specs.length - INITIAL_VISIBLE} datos`}
          </button>
        </div>
      )}
    </div>
  );
}