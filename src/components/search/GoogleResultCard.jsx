import { useState, useEffect } from 'react';
import { FileText, Globe, ExternalLink, ArrowRight, Loader2, GitCompareArrows } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { compareReferenceIndustrialpedia } from '../../../base44/shared/supabaseIndustrialpediaApi.js';
import { useLanguage, localizeProductName, localizeSpecAttribute, localizeSpecValue, localizeTechnicalText } from '@/lib/i18n';

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

function inferCategory(result) {
  const raw = `${result.category || ''} ${result.component_type_label || ''} ${result.product_identity?.short_description || ''} ${result.product_name || ''} ${result.title || ''}`.toLowerCase();
  if (/proximity|inductive sensor|sensor inductivo/.test(raw)) return 'proximity_sensor';
  if (/pressure sensor|sensor de presión/.test(raw)) return 'pressure_sensor';
  if (/servo drive|servodrive|servo amplifier/.test(raw)) return 'servo_drive';
  if (/servo motor/.test(raw)) return 'servo_motor';
  if (/solenoid valve|válvula solenoide/.test(raw)) return 'solenoid_valve';
  if (/fieldbus|remote i\/o|fieldbus node/.test(raw)) return 'fieldbus_node';
  return result.category || result.product_identity?.category || '';
}

function buildReferenceSpecs(result) {
  const source = Array.isArray(result.basic_specs) ? result.basic_specs : [];
  const out = {};
  for (const s of source) {
    const key = String(s.attribute || s.attribute_name || '').trim();
    const value = s.value;
    if (!key || value === undefined || value === null || value === '') continue;
    out[key] = s.unit ? { value, unit: s.unit } : value;
  }
  return out;
}

export default function GoogleResultCard({ result, query, onFicha }) {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [imageSrc, setImageSrc] = useState(isUsableImageUrl(result.image_url) ? result.image_url : '');
  const [err, setErr] = useState('');

  // Sincroniza la imagen cuando llega un nuevo result (búsqueda consecutiva).
  // Sin esto, React reutiliza el componente por key y la imagen stale de la
  // búsqueda anterior persiste aunque result.image_url haya cambiado.
  useEffect(() => {
    setImageSrc(isUsableImageUrl(result.image_url) ? result.image_url : '');
  }, [result.image_url]);

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
        source_content: result.raw_content || result.snippet || '',
        image_url: result.image_url || ''
      });
      const ficha = res?.data;
      if (!ficha || ficha.found === false) throw new Error(ficha?.error || t.unableToExtractSheet);
      onFicha(ficha);
    } catch (e) {
      setErr(e?.message || t.unableToBuildSheet);
    } finally {
      setLoading(false);
    }
  };

  const sourceKey = result.source_type === 'official' ? 'officialManufacturer' : result.source_type === 'distributor' ? 'distributor' : 'webSource';
  const stBase = SOURCE_TYPE_LABELS[result.source_type] || SOURCE_TYPE_LABELS.cse_configured;
  const st = { ...stBase, label: t[sourceKey] || stBase.label };
  const isFestoOfficial = String(result.manufacturer_name || result.product_identity?.manufacturer || '').toLowerCase() === 'festo';
  const referenceCategory = inferCategory(result);
  const referenceSpecs = buildReferenceSpecs(result);
  const canCompareReference = isFestoOfficial && referenceCategory && Object.keys(referenceSpecs).length >= 2;

  return (
    <div className="bg-[#161a20] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          {result.product_identity?.manufacturer && (
            <div className="text-[11px] text-[#5a9cd9] font-medium uppercase tracking-wide truncate">{result.product_identity.manufacturer}</div>
          )}
          <div className={`text-sm font-semibold leading-snug truncate ${result.product_identity?.identified === false ? 'text-white/50' : 'text-white'}`}>
            {localizeProductName(result.product_identity?.short_description || result.product_name || result.title || t.productFound, language)}
          </div>
          {result.product_identity?.variants?.length > 1 && (
            <div className="mt-0.5 text-[10px] text-amber-400/80">{result.product_identity.variants.length} {t.variantsDetected}</div>
          )}
          {result.product_identity?.part_number && (
            <div className="mt-0.5 text-xs font-mono text-white/60 truncate">{result.product_identity.part_number}</div>
          )}
          {result.product_identity?.source_title && result.product_identity.source_title !== result.product_identity?.short_description && (
            <div className="mt-1 text-[10px] text-white/25 truncate">{t.sourceTitle}: {result.product_identity.source_title}</div>
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
            <div className="text-[10px] uppercase tracking-wider text-white/20 text-center px-2">{t.noVerifiedImage}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {result.description && <p className="text-white/55 text-xs leading-relaxed line-clamp-3">{localizeTechnicalText(result.description, language)}</p>}
          {Array.isArray(result.basic_specs) && result.basic_specs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.basic_specs.map((s, i) => (
                <span key={i} className="inline-flex items-center text-[10px] font-mono text-white/70 bg-white/[0.04] border border-white/10 rounded px-1.5 py-0.5">
                  <span className="text-white/40 mr-1">{localizeSpecAttribute(s.attribute || s.attribute_name || '', language)}:</span>{localizeSpecValue(s.value, language)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/45">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{result.display_link || result.url}</span>
            {result.is_pdf && <span className="text-[#47bcb6] flex items-center gap-0.5 shrink-0"><FileText className="w-3 h-3" /> PDF</span>}
          </div>
        </div>
      </div>

      {err && <p className="text-red-300 text-[11px] mb-3">{err}</p>}
      {compareError && <p className="text-amber-300 text-[11px] mb-3">{compareError}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={verFicha}
          disabled={loading}
          className="flex items-center gap-1 bg-[#5a9cd9] hover:bg-[#4f8fc7] disabled:opacity-60 text-[#0a0e12] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> {t.extractingSheet}</> : <>{t.viewSheet} <ArrowRight className="w-3 h-3" /></>}
        </button>
        {canCompareReference && (
          <button
            onClick={async () => {
              setCompareLoading(true);
              setCompareError('');
              try {
                const response = await compareReferenceIndustrialpedia({
                  manufacturer: 'Festo',
                  partNumber: result.part_number || result.product_identity?.part_number || '',
                  category: referenceCategory,
                  specifications: referenceSpecs,
                  limit: 5
                });
                navigate('/comparar-referencia', { state: { reference: response.reference, result: response.result } });
              } catch (e) {
                setCompareError(e?.message || t.unableToCompareReference);
              } finally {
                setCompareLoading(false);
              }
            }}
            disabled={compareLoading}
            className="flex items-center gap-1 bg-[#168fd5]/15 hover:bg-[#168fd5]/25 disabled:opacity-60 text-[#65a9e6] text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#168fd5]/30 transition-colors"
          >
            {compareLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> {t.comparing}</> : <><GitCompareArrows className="w-3 h-3" /> {t.compareAlternatives}</>} 
          </button>
        )}
        <a
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-white/60 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 transition-colors"
        >
          {t.viewSource} <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}