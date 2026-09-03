import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { useLanguage, localizeSpecAttributeStrict, localizeSpecValue } from '@/lib/i18n';

// Prefijos de fabricante conocidos que ensucian la lectura del codigo crudo.
// Quitarlos es solo formato -- no inventa significado tecnico ni pretende
// ser una traduccion curada (eso vive en spec_property_definitions para las
// propiedades SI clasificadas). Aqui solo hacemos legible lo ilegible.
const KNOWN_PREFIXES = ['siemens_', 'mouser_', 'analog_', 'diodes_'];

function humanizeRawLabel(raw) {
  let s = String(raw || '').trim();
  if (!s) return s;
  for (const prefix of KNOWN_PREFIXES) {
    if (s.toLowerCase().startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Estos datos SI vienen de una fuente real (misma evidencia que el resto de la
// ficha), pero ningun alias de la taxonomia los reconocio todavia como una
// propiedad formal. Por eso NUNCA se mezclan con SpecList: mezclarlos haria
// que parecieran comparables entre fabricantes cuando en realidad no lo son
// (evaluate_substitution_v1 / compare_parts_v1 solo leen specifications, no
// esta lista). Se muestran colapsados y con lenguaje explicito de "sin
// clasificar" para no aparentar mas certeza tecnica de la que hay.
export default function UnclassifiedSpecs({ items }) {
  const [expanded, setExpanded] = useState(false);
  const { language } = useLanguage();
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3 bg-[#11161c] border border-white/10 rounded-lg px-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-1.5 py-2 text-left"
        aria-expanded={expanded}
      >
        <span className="inline-flex items-center gap-1.5 text-white/40 text-[10px] uppercase tracking-wider">
          <HelpCircle className="w-3 h-3" />
          Datos adicionales sin clasificar · {items.length}
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-white/40" /> : <ChevronDown className="h-3.5 w-3.5 text-white/40" />}
      </button>
      {expanded && (
        <div className="pb-1.5">
          <p className="text-white/30 text-[10px] px-1.5 pb-2 leading-snug">
            Presentes en la fuente original, pero aun no forman parte de la taxonomía técnica estándar. No se usan para comparar entre fabricantes.
          </p>
          {items.map((it) => (
            <div key={it.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 px-1.5 py-1.5 border-t border-white/5">
              <span className="text-white/40 text-[11px] break-words">{localizeSpecAttributeStrict(humanizeRawLabel(it.label), language)}</span>
              <span className="text-white/60 text-[11px] text-right break-words">{it.value != null ? localizeSpecValue(it.value, language) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
