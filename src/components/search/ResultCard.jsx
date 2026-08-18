import { Link } from 'react-router-dom';
import { ShieldCheck, AlertCircle, ArrowRight, FileText } from 'lucide-react';

const STATE_LABELS = {
  published: { label: 'Publicado', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' },
  validated: { label: 'Validado', cls: 'text-[#5a9cd9] bg-[#5a9cd9]/10' },
  incomplete: { label: 'Incompleto', cls: 'text-[#e68a00] bg-[#e68a00]/10' },
  rejected: { label: 'Rechazado', cls: 'text-red-400 bg-red-400/10' },
  processed: { label: 'Procesado', cls: 'text-white/50 bg-white/10' }
};

export default function ResultCard({ result }) {
  const st = result.discovery_state === 'discovered'
    ? { label: 'Encontrado · pendiente de verificación', cls: 'text-[#e68a00] bg-[#e68a00]/10' }
    : result.discovery_state === 'pending_verification'
      ? { label: 'Pendiente de verificación', cls: 'text-[#e68a00] bg-[#e68a00]/10' }
      : result.discovery_state === 'verified'
        ? { label: 'Encontrado · verificado', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' }
        : (STATE_LABELS[result.validation_state] || STATE_LABELS.processed);
  return (
    <div className="bg-[#161a20] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-white font-semibold text-sm truncate">{result.part_number || result.title || 'Resultado encontrado'}</div>
          <div className="text-white/50 text-xs">{result.manufacturer_name || (result.discovery_state === 'discovered' ? 'Fuente externa' : '')}{result.category ? ` · ${result.category}` : ''}</div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded ${st.cls} shrink-0`}>{st.label}</span>
      </div>

      {result.description && (
        <p className="text-white/45 text-xs leading-relaxed mb-3">{result.description}</p>
      )}
      {result.discovery_state === 'discovered' && (
        <p className="text-white/35 text-[11px] mb-3">Encontrado fuera del Knowledge Core. Aún no tiene ficha técnica validada en Industrialpedia.</p>
      )}

      {result.top_specs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {result.top_specs.map((s, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/55 text-[11px]">
              {s.attribute}: {s.value}{s.unit ? ` ${s.unit}` : ''}
            </span>
          ))}
          {result.spec_count > 4 && (
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 text-[11px]">
              +{result.spec_count - 4} specs
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 text-[11px]">
        {result.has_evidence ? (
          <span className="flex items-center gap-1 text-[#47bcb6]">
            <ShieldCheck className="w-3.5 h-3.5" /> {result.evidence_count} evidencia(s)
          </span>
        ) : (
          <span className="flex items-center gap-1 text-white/40">
            <AlertCircle className="w-3.5 h-3.5" /> sin evidencia
          </span>
        )}
        {result.source_ids.length > 0 && (
          <span className="flex items-center gap-1 text-white/40">
            <FileText className="w-3.5 h-3.5" /> {result.source_ids.length} fuente(s)
          </span>
        )}
        {result.source_url && (
          <a href={result.source_url} target="_blank" rel="noreferrer" className="text-[#5a9cd9] hover:underline">Ver fuente</a>
        )}
        <span className="text-white/30 ml-auto capitalize">{result.match.replace(/_/g, ' ')}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {result.id ? (
          <Link
            to={`/parte/${result.id}`}
            className="flex items-center gap-1 bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Ver componente <ArrowRight className="w-3 h-3" />
          </Link>
        ) : result.source_url ? (
          <a
            href={result.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Abrir fuente <ArrowRight className="w-3 h-3" />
          </a>
        ) : null}
        <button
          disabled
          title="Pilar ENCONTRAR — próxima iteración"
          className="text-white/60 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 cursor-not-allowed opacity-60"
        >
          Encontrar alternativas
        </button>
        <button
          disabled
          title="Pilar COMPARAR — próxima iteración"
          className="text-white/60 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 cursor-not-allowed opacity-60"
        >
          Comparar
        </button>
      </div>
    </div>
  );
}