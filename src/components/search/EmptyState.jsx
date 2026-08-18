import { SearchX } from 'lucide-react';

export default function EmptyState({ q, onReset }) {
  return (
    <div className="text-center py-16 px-5">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
        <SearchX className="w-6 h-6 text-white/40" />
      </div>
      <p className="text-white/60 text-sm mb-2">No encontramos resultados para esta consulta.</p>
      <p className="text-white/30 text-xs max-w-xs mx-auto leading-relaxed mb-5">
        Prueba con un número de parte, fabricante, familia o descripción técnica diferente.
      </p>
      <button
        onClick={onReset}
        className="text-[#5a9cd9] text-xs font-medium hover:underline"
      >
        Modificar la búsqueda
      </button>
    </div>
  );
}