import { useState } from 'react';
import { FileText, Globe, ExternalLink, ArrowRight, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function isUsableImageUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol);
  } catch { return false; }
}

const SOURCE_TYPE_LABELS = {
  official: { label: 'Fabricante oficial', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' },
  distributor: { label: 'Distribuidor', cls: 'text-[#5a9cd9] bg-[#5a9cd9]/10' },
  cse_configured: { label: 'Fuente web', cls: 'text-white/55 bg-white/10' },
  web_discovery: { label: 'Fuente web', cls: 'text-white/55 bg-white/10' }
};

export default function GoogleResultCard({ result, query, onFicha }) {
  const [loading, setLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState(isUsableImageUrl(result.image_url) ? result.image_url : '');
  const [err, setErr] = useState('');

  const verFicha = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await base44.functions.invoke('ExtraerFichaTecnica', {
        url: result.url,
        query,
        manufacturer_hint: result.manufacturer_name || '',
        part_number_hint: result.part_number || '',
        source_type: result.source_type,
        source_content: result.raw_content || result.snippet || ''
      });
      const ficha = res?.data;
      if (!ficha || ficha.found === false) throw new Error(ficha?.error || 'No se pudo extraer la ficha de esta fuente.');
      onFicha(ficha);
    } catch (e) {
      setErr(e?.message || 'No se pudo construir la ficha.');
    } finally {
      setLoading(false);
    }
  };

  const st = SOURCE_TYPE_LABELS[result.source_type] || SOURCE_TYPE_LABELS.cse_configured;

  return (
    <div className="bg-[#161a20] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          {result.manufacturer_name && (
            <div className="text-[11px] text-[#5a9cd9] font-medium uppercase tracking-wide truncate">{result.manufacturer_name}</div>
          )}
          <div className="text-white font-semibold text-sm leading-snug truncate">{result.product_name || result.title || 'Producto encontrado'}</div>
          {result.part_number && (
            <div className="mt-0.5 text-xs font-mono text-white/60 truncate">{result.part_number}</div>
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded ${st.cls} shrink-0`}>{st.label}</span>
      </div>

      <div className="flex gap-4 mb-3">
        <div className="w-28 h-28 shrink-0 rounded-xl border border-white/10 bg-[#0f1318] flex items-center justify-center overflow-hidden">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={result.product_name || ''}
              className="w-full h-full object-contain p-2"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageSrc('')}
            />
          ) : (
            <div className="text-[10px] uppercase tracking-wider text-white/20 text-center px-2">Imagen del producto</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {result.description && <p className="text-white/55 text-xs leading-relaxed line-clamp-3">{result.description}</p>}
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/45">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{result.display_link || result.url}</span>
            {result.is_pdf && <span className="text-[#47bcb6] flex items-center gap-0.5 shrink-0"><FileText className="w-3 h-3" /> PDF</span>}
          </div>
        </div>
      </div>

      {err && <p className="text-red-300 text-[11px] mb-3">{err}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={verFicha}
          disabled={loading}
          className="flex items-center gap-1 bg-[#5a9cd9] hover:bg-[#4f8fc7] disabled:opacity-60 text-[#0a0e12] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Extrayendo ficha…</> : <>Ver ficha <ArrowRight className="w-3 h-3" /></>}
        </button>
        <a
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-white/60 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 transition-colors"
        >
          Ver fuente <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}