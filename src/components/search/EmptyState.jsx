import { SearchX } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function EmptyState({ q, onReset }) {
  const { language } = useLanguage();
  const copy = {
    es: ['No encontramos resultados para esta consulta.', 'Prueba con un número de parte, fabricante, familia o descripción técnica diferente.', 'Modificar la búsqueda'],
    en: ['No results found for this query.', 'Try a different part number, manufacturer, family or technical description.', 'Modify search'],
    de: ['Keine Ergebnisse für diese Suche.', 'Versuchen Sie eine andere Teilenummer, einen anderen Hersteller, eine andere Familie oder technische Beschreibung.', 'Suche ändern'],
    fr: ['Aucun résultat pour cette recherche.', 'Essayez une autre référence, un autre fabricant, une autre famille ou une autre description technique.', 'Modifier la recherche'],
    zh: ['未找到相关结果。', '请尝试其他零件号、制造商、技术类别或技术描述。', '修改搜索']
  }[language] || ['No encontramos resultados para esta consulta.', 'Prueba con un número de parte, fabricante, familia o descripción técnica diferente.', 'Modificar la búsqueda'];
  const [title, body, action] = copy;
  return (
    <div className="text-center py-16 px-5">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
        <SearchX className="w-6 h-6 text-white/40" />
      </div>
      <p className="text-white/60 text-sm mb-2">{title}</p>
      <p className="text-white/30 text-xs max-w-xs mx-auto leading-relaxed mb-5">
        {body}
      </p>
      <button
        onClick={onReset}
        className="text-[#ea580c] text-xs font-medium hover:underline"
      >
        {action}
      </button>
    </div>
  );
}