// Evidence/provenance (design brief #9): "la confianza es una característica
// principal". compareIndustrialpedia()'s alternatives already carry a raw
// `evidence` array per the Knowledge Core audit -- it was fetched but never
// rendered anywhere. This surfaces exactly what's there: a count and, on
// hover, the evidence type/source labels the backend actually returned. No
// fabricated "Manufacturer datasheet ✓ Verified" list -- if the array is
// empty, this renders nothing rather than implying evidence that doesn't
// exist.
import { ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const LABELS = {
  es: (n) => `${n} ${n === 1 ? 'fuente verificada' : 'fuentes verificadas'}`,
  en: (n) => `${n} verified ${n === 1 ? 'source' : 'sources'}`,
  de: (n) => `${n} verifizierte ${n === 1 ? 'Quelle' : 'Quellen'}`,
  fr: (n) => `${n} ${n === 1 ? 'source vérifiée' : 'sources vérifiées'}`,
  zh: (n) => `${n} 个已验证来源`,
};

export default function EvidenceBadge({ evidence, language = 'es', className = '' }) {
  const list = Array.isArray(evidence) ? evidence : [];
  if (!list.length) return null;
  const detail = list
    .map((e) => e?.evidence_type || e?.source_type || e?.type)
    .filter(Boolean)
    .join(', ');

  const badge = (
    <span className={`inline-flex items-center gap-1 text-[10px] text-white/45 ${className}`}>
      <ShieldCheck className="h-3 w-3 ip-state-text-match" aria-hidden="true" />
      {(LABELS[language] || LABELS.es)(list.length)}
    </span>
  );

  if (!detail) return badge;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild><span className="cursor-help">{badge}</span></TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
