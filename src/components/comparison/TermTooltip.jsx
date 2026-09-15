// Dual-language UX (design brief #6): wraps a technical term/value with a
// hover/focus explanation in plain language, without ever hiding the term
// itself -- the specialist reads "PNP" directly; the non-specialist gets
// "Salida digital tipo sourcing..." on hover. Renders the term unwrapped
// (no extra markup, no dotted underline) when the glossary has no entry for
// it, so this is safe to wrap around every spec value without visual noise.
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { glossaryExplain } from '@/lib/technicalGlossary';

export default function TermTooltip({ term, language = 'es', children, className = '' }) {
  const explanation = glossaryExplain(term, language);
  if (!explanation) return children ?? term;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`underline decoration-dotted decoration-white/30 underline-offset-2 cursor-help ${className}`}>
            {children ?? term}
          </span>
        </TooltipTrigger>
        <TooltipContent>{explanation}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
