import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getPartIndustrialpedia } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { ShieldCheck, AlertCircle, ArrowRight, FileText } from 'lucide-react';

function isUsableImageUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol);
  } catch { return false; }
}

const STATE_LABELS = {
  published: { label: 'Publicado', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' },
  validated: { label: 'Validado', cls: 'text-[#5a9cd9] bg-[#5a9cd9]/10' },
  incomplete: { label: 'Incompleto', cls: 'text-[#e68a00] bg-[#e68a00]/10' },
  rejected: { label: 'Rechazado', cls: 'text-red-400 bg-red-400/10' },
  processed: { label: 'Procesado', cls: 'text-white/50 bg-white/10' }
};

export default function ResultCard({ result }) {
  const navigate = useNavigate();
  const [materializing, setMaterializing] = useState(false);
  const [imageSrc, setImageSrc] = useState(result.image_url || '');
  const [imageVerified, setImageVerified] = useState(result.image_verification_status === 'verified');

  useEffect(() => {
    let cancelled = false;
    const initialUrl = typeof result.image_url === 'string' ? result.image_url.trim() : '';
    setImageSrc(initialUrl);
    setImageVerified(result.image_verification_status === 'verified');

    if (initialUrl || !result.id) return () => { cancelled = true; };

    // Canonical fallback: if the Base44 search function is serving an older
    // deployed payload, read the same part from the canonical Supabase API.
    // This does not discover or guess images; it only retrieves a verified
    // image already associated with this exact canonical part_id.
    getPartIndustrialpedia(result.id)
      .then((data) => {
        const part = data?.part;
        const url = typeof part?.image_url === 'string' ? part.image_url.trim() : '';
        if (!cancelled && url) {
          setImageSrc(url);
          setImageVerified(part?.image_verification_status === 'verified');
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [result.id, result.image_url, result.image_verification_status]);
  const [materializeError, setMaterializeError] = useState('');
  const isVerified = imageVerified || result.discovery_state === 'verified' ||
    (['published', 'validated'].includes(result.validation_state) && Boolean(result.has_evidence));
  const st = isVerified
    ? { label: 'Verificado', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' }
    : result.discovery_state === 'discovered'
      ? { label: 'Encontrado · pendiente de verificación', cls: 'text-[#e68a00] bg-[#e68a00]/10' }
      : result.discovery_state === 'pending_verification'
        ? { label: 'Pendiente de verificación', cls: 'text-[#e68a00] bg-[#e68a00]/10' }
        : (STATE_LABELS[result.validation_state] || STATE_LABELS.processed);
  return (
    <div className="bg-[#161a20] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className={`text-sm font-semibold truncate ${(result.part_number || result.product_identity?.identified) ? 'text-white' : 'text-white/50'}`}>
            {result.part_number || result.product_identity?.short_description || 'Producto no identificado'}
          </div>
          <div className="text-white/50 text-xs">{result.manufacturer_name || (result.discovery_state === 'discovered' ? 'Fuente externa' : '')}{result.category ? ` · ${result.category}` : ''}</div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded ${st.cls} shrink-0`}>{st.label}</span>
      </div>

      <div className="mb-3 flex gap-3">
        <div className="w-20 h-20 shrink-0 rounded-xl border border-white/10 bg-[#0f1318] flex items-center justify-center overflow-hidden">
          {isUsableImageUrl(imageSrc) ? (
            <img
              src={imageSrc}
              alt={result.part_number || ''}
              className="w-full h-full object-contain p-1.5"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-[9px] uppercase tracking-wider text-white/20 text-center px-1.5">Sin imagen verificada</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {result.source_title && result.source_title !== result.part_number && result.source_title.trim() !== (result.description || '').trim() && (
            <div className="text-white/25 text-[10px] leading-snug mb-1">Título de la fuente: {result.source_title}</div>
          )}
          {result.description && (
            <p className="text-white/55 text-xs leading-relaxed line-clamp-4">{result.description}</p>
          )}
        </div>
      </div>
      {result.discovery_state === 'discovered' && (
        <p className="text-white/35 text-[11px] mb-3">
          {result.part_number
            ? 'Fuente encontrada. La ficha técnica se construye directamente desde esta fuente, sin inventar datos.'
            : 'Fuente encontrada. Esta consulta aún no identifica un número de parte concreto; revisa la fuente para ver los productos disponibles.'}
        </p>
      )}
      {materializeError && (
        <p className="text-red-300 text-[11px] mb-3">{materializeError}</p>
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
          <span className="flex items-center gap-1 text-[#e68a00]/75">
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
            to={`/parte/${result.id}${result.part_number ? `?pn=${encodeURIComponent(result.part_number)}` : ''}`}
            className="flex items-center gap-1 bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Ver componente <ArrowRight className="w-3 h-3" />
          </Link>
        ) : result.catalog_id && result.source_url ? (
          <a
            href={result.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Ver producto <ArrowRight className="w-3 h-3" />
          </a>
        ) : result.discovery_id && result.part_number ? (
          <button
            disabled={materializing}
            onClick={async () => {
              setMaterializing(true);
              setMaterializeError('');
              try {
                const res = await base44.functions.invoke('MaterializeDiscovery', {
                  discovery_id: result.discovery_id,
                  query: result.part_number || result.title || ''
                });
                const partId = res?.data?.part_id;
                if (!partId) throw new Error('No se pudo crear la ficha desde la fuente encontrada.');
                navigate(`/parte/${partId}`);
              } catch (e) {
                setMaterializeError(e?.message || 'No se pudo crear la ficha.');
              } finally {
                setMaterializing(false);
              }
            }}
            className="flex items-center gap-1 bg-[#5a9cd9] hover:bg-[#4f8fc7] disabled:opacity-60 text-[#0a0e12] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            {materializing ? 'Creando ficha…' : 'Ver ficha técnica'} <ArrowRight className="w-3 h-3" />
          </button>
        ) : result.source_url ? (
          <a
            href={result.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Ver fuente <ArrowRight className="w-3 h-3" />
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