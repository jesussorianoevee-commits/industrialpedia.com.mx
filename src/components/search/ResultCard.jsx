import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getPartIndustrialpedia } from '../../../base44/shared/supabaseIndustrialpediaApi.js';
import { normalizeImageUrl, resolveProductImage, clearProductImageCache } from '@/lib/productImage';
import { ShieldCheck, AlertCircle, ArrowRight, FileText, GitCompareArrows, Loader2 } from 'lucide-react';
import { compareReferenceIndustrialpedia } from '../../../base44/shared/supabaseIndustrialpediaApi.js';
import { useLanguage, localizeProductName, localizeSpecAttribute, localizeSpecValue, localizeTechnicalTerm, localizeTechnicalText, localizedCount } from '@/lib/i18n';
import { getDisplayPartReference } from '@/lib/partIdentity';

function isUsableImageUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol);
  } catch { return false; }
}

const STATE_LABELS = {
  published: 'published',
  validated: 'validated',
  incomplete: 'incomplete',
  rejected: 'rejected',
  processed: 'processed'
};

export default function ResultCard({ result, index = 0 }) {
  const navigate = useNavigate();
  const [imageSrc, setImageSrc] = useState(normalizeImageUrl(result.image_url));
  const [imageVerified, setImageVerified] = useState(result.image_verification_status === 'verified');
  const [imageLookupPending, setImageLookupPending] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const initialUrl = imageRetry > 0 ? '' : normalizeImageUrl(result.image_url);
    const exactPartNumber = String(result.part_number || '').trim();
    setImageSrc(initialUrl);
    setImageVerified(result.image_verification_status === 'verified');
    setImageLookupPending(false);

    const applyImage = (url, verified = false) => {
      const cleanUrl = typeof url === 'string' ? url.trim() : '';
      if (!cancelled && cleanUrl) {
        setImageSrc(cleanUrl);
        setImageVerified(Boolean(verified));
        return true;
      }
      return false;
    };

    const resolveImage = async () => {
      // En listados paginados, la imagen no debe provocar una consulta por tarjeta.
      // La ruta de área ya hace una resolución colectiva; si viene marcada como
      // diferida, mantenemos el placeholder y dejamos la ficha para la resolución.
      if (result.defer_image_lookup) return;

      // 1) La búsqueda canónica de Industrialpedia es la fuente principal.
      // Volvemos a leer la ficha exacta para evitar que un payload resumido
      // de resultados oculte una imagen que sí existe en el Knowledge Core.
      if (!initialUrl && result.id) {
        try {
          const data = await getPartIndustrialpedia(result.id);
          const part = data?.part;
          if (applyImage(part?.image_url, part?.image_verification_status === 'verified')) return;
        } catch { /* continuar con adquisición exacta */ }
      }

      // 2) Si el Knowledge Core realmente no tiene imagen, usamos únicamente
      // adquisición determinística por número de parte exacto. No hay IA, no hay
      // coincidencias aproximadas y nunca se reutiliza la imagen de otra pieza.
      if (!initialUrl && exactPartNumber) {
        const cacheKey = `industrialpedia:image:v2:${String(result.manufacturer_name || '').toLowerCase()}:${exactPartNumber.toLowerCase()}`;
        try {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.image_url && applyImage(parsed.image_url, parsed.verified === true)) return;
            if (parsed?.status === 'not_found') return;
          }
        } catch {}

        if (!cancelled) setImageLookupPending(true);
        try {
          const acquired = await resolveProductImage({
            partNumber: exactPartNumber,
            manufacturer: result.manufacturer_name || '',
            sourceUrl: result.source_url || result.document_url || result.image_source || '',
            existingUrl: '',
            forceLookup: imageRetry > 0
          });
          const acquiredUrl = acquired.image_url || '';
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(acquiredUrl
              ? { image_url: acquiredUrl, verified: acquired.verified === true }
              : { status: acquired.status || 'not_found' }
            ));
          } catch {}
          if (acquiredUrl) applyImage(acquiredUrl, acquired.verified === true);
        } catch {
          // La ausencia o fallo de una API externa no debe inventar una imagen.
        } finally {
          if (!cancelled) setImageLookupPending(false);
        }
      }
    };

    if (!initialUrl) resolveImage();
    return () => { cancelled = true; };
  }, [result.defer_image_lookup, result.id, result.part_number, result.image_url, result.image_verification_status, result.manufacturer_name, result.source_url, result.document_url, imageRetry]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
  const { language, t } = useLanguage();
  const isVerified = imageVerified || result.discovery_state === 'verified' ||
    (['published', 'validated'].includes(result.validation_state) && Boolean(result.has_evidence));
  const inferReferenceCategory = () => {
    const raw = `${result.category || ''} ${result.product_identity?.short_description || ''} ${result.description || ''}`.toLowerCase();
    if (/proximity|inductive sensor|sensor inductivo/.test(raw)) return 'proximity_sensor';
    if (/pressure sensor|sensor de presión/.test(raw)) return 'pressure_sensor';
    if (/servo drive|servodrive|servo amplifier/.test(raw)) return 'servo_drive';
    if (/servo motor/.test(raw)) return 'servo_motor';
    if (/solenoid valve|válvula solenoide/.test(raw)) return 'solenoid_valve';
    if (/fieldbus|remote i\/o|fieldbus node/.test(raw)) return 'fieldbus_node';
    return result.category || '';
  };
  const referenceSpecs = Object.fromEntries((Array.isArray(result.top_specs) ? result.top_specs : []).filter(s => s?.attribute && s?.value !== undefined && s?.value !== null && s?.value !== '').map(s => [s.attribute, s.unit ? { value: s.value, unit: s.unit } : s.value]));
  const isFestoDiscovery = String(result.manufacturer_name || '').toLowerCase() === 'festo' && result.discovery_state === 'discovered';
  const normalizeIdentity = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const manufacturerIsSameAsPartNumber = Boolean(result.manufacturer_name && result.part_number && normalizeIdentity(result.manufacturer_name) === normalizeIdentity(result.part_number));
  const rawDisplayProductName = result.title || result.product_name || result.product_identity?.short_description || result.name || '';
  const displayProductName = localizeProductName(rawDisplayProductName, language);
  const displayReference = getDisplayPartReference({
    part_number: result.part_number,
    name: displayProductName,
    title: result.title,
    product_name: result.product_name
  });
  const displayManufacturer = manufacturerIsSameAsPartNumber ? '' : result.manufacturer_name;
  // category_label viene ya resuelto desde technical_families (fuente unica
  // de verdad en Supabase). Si no viene (fuente vieja o familia sin registrar
  // todavia), se cae al mecanismo previo de traduccion local.
  const displayCategory = result.category_label
    || (result.category && !/^category$/i.test(String(result.category).trim()) ? localizeTechnicalTerm(result.category, language) : '');
  const canCompareReference = isFestoDiscovery && inferReferenceCategory() && Object.keys(referenceSpecs).length >= 2;
  const canOpenComparator = Boolean(result.id);

  const openComparator = async () => {
    setCompareError('');
    if (result.id) {
      navigate(`/comparar/${encodeURIComponent(result.id)}?pn=${encodeURIComponent(result.part_number || '')}`);
      return;
    }
  };

  const stateLabel = { published: t.published, validated: t.validated, incomplete: t.incomplete, rejected: t.rejected, processed: t.processed }[STATE_LABELS[result.validation_state]] || t.processed;
  const st = isVerified
    ? { label: t.verified, cls: 'text-[#47bcb6] bg-[#47bcb6]/10' }
    : result.discovery_state === 'discovered'
      ? { label: t.foundPendingVerification, cls: 'text-[#e68a00] bg-[#e68a00]/10' }
      : result.discovery_state === 'pending_verification'
        ? { label: t.pendingVerification, cls: 'text-[#e68a00] bg-[#e68a00]/10' }
        : { label: stateLabel, cls: 'text-white/50 bg-white/10' };
  return (
    <div
      className="ip-card ip-stagger-in relative overflow-hidden p-4 sm:p-5 hover:border-[#ea580c]/35 hover:bg-[#181d24] hover:-translate-y-0.5 transition-all"
      style={{ '--ip-delay': Math.min(index, 10) * 40 }}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] ${isVerified ? 'bg-[#47bcb6]' : result.discovery_state === 'discovered' || result.discovery_state === 'pending_verification' ? 'bg-[#e68a00]' : 'bg-border'}`}
      />
      <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-white/[0.06]">
        <div className="min-w-0">
          <div className={`text-sm font-semibold leading-snug line-clamp-2 ${displayProductName ? 'text-white' : 'text-white/50'}`}>
            {displayProductName || 'Producto no identificado'}
          </div>
          <div className="mt-1 text-white/50 text-xs">
            {displayManufacturer || (result.discovery_state === 'discovered' ? t.externalSource : '')}
            {displayManufacturer && displayReference ? ' · ' : ''}
            {displayReference ? `${t.partNumber}: ${displayReference}` : ''}
            {displayCategory ? ` · ${displayCategory}` : ''}
          </div>
        </div>
        <span className={`text-[10px] px-2.5 py-1 rounded-full ${st.cls} shrink-0`}>{st.label}</span>
      </div>

      <div className="mb-3 flex gap-3">
        <div className="ip-thumb-frame w-[72px] h-[72px] sm:w-20 sm:h-20 shrink-0 rounded-2xl border border-white/10 bg-[#0f1318] flex items-center justify-center overflow-hidden shadow-inner">
          {isUsableImageUrl(imageSrc) ? (
            <button
              type="button"
              onClick={() => setImagePreviewOpen(true)}
              className="group w-full h-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#ea580c] rounded-2xl"
              aria-label={`Ampliar imagen de ${result.part_number || 'la pieza'}`}
            >
              <img
                src={imageSrc}
                alt={result.part_number || ''}
                className="w-full h-full object-contain p-1.5 transition-transform duration-300 group-hover:scale-110"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => {
                  clearProductImageCache(result.part_number, result.manufacturer_name || '');
                  if (imageRetry < 1) setImageRetry((n) => n + 1);
                  else setImageSrc('');
                }}
              />
            </button>
          ) : imageLookupPending ? (
            <Loader2 className="w-5 h-5 text-[#ea580c]/60 animate-spin" aria-label="Buscando imagen" />
          ) : (
            <span className="text-[9px] uppercase tracking-wider text-white/20 text-center px-1.5">{t.noVerifiedImage}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {result.source_title && result.source_title !== result.part_number && result.source_title.trim() !== (result.description || '').trim() && (
            <div className="text-white/25 text-[10px] leading-snug mb-1">{t.sourceTitle}: {result.source_title}</div>
          )}
          {result.description && (
            <p className="text-white/55 text-xs leading-relaxed line-clamp-3 sm:line-clamp-2">{localizeTechnicalText(result.description, language)}</p>
          )}
        </div>
      </div>
      {compareError && <p className="text-amber-300 text-[11px] mb-3">{compareError}</p>}

      {result.top_specs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {result.top_specs.slice(0, 4).map((s, i) => (
            <span key={i} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/55 text-[11px]">
              {localizeSpecAttribute(s.attribute, language)}: {localizeSpecValue(s.value, language)}{s.unit ? ` ${s.unit}` : ''}
            </span>
          ))}
          {result.spec_count > 4 && (
            <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/40 text-[11px]">
              +{localizedCount(result.spec_count - 4, t.spec, t.specs, language)}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 text-[11px]">
        {result.has_evidence ? (
          <span className="flex items-center gap-1 text-[#47bcb6]">
            <ShieldCheck className="w-3.5 h-3.5" /> {result.evidence_count} {t.evidence}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[#e68a00]/75">
            <AlertCircle className="w-3.5 h-3.5" /> {t.noEvidence}
          </span>
        )}
        {result.source_ids.length > 0 && (
          <span className="flex items-center gap-1 text-white/40">
            <FileText className="w-3.5 h-3.5" /> {localizedCount(result.source_ids.length, t.source, t.sources, language)}
          </span>
        )}
        {result.source_url && (
          <a href={result.source_url} target="_blank" rel="noreferrer" className="text-[#ea580c] hover:underline">{t.viewSource}</a>
        )}
        {result.match && !/^category$/i.test(String(result.match).trim()) && (
          <span className="text-white/30 ml-auto capitalize">{result.match.replace(/_/g, ' ')}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-3 border-t border-white/[0.06]">
        {result.id ? (
          <Link
            to={`/parte/${result.id}`}
            className="ip-button-primary inline-flex items-center gap-1.5 shadow-sm"
          >
            {t.viewComponent} <ArrowRight className="w-3 h-3" />
          </Link>
        ) : result.catalog_id && result.source_url ? (
          <a
            href={result.source_url}
            target="_blank"
            rel="noreferrer"
            className="ip-button-primary inline-flex items-center gap-1.5 shadow-sm"
          >
            {t.viewProduct} <ArrowRight className="w-3 h-3" />
          </a>
        ) : result.source_url ? (
          <a
            href={result.source_url}
            target="_blank"
            rel="noreferrer"
            className="ip-button-primary inline-flex items-center gap-1.5 shadow-sm"
          >
            {t.viewSource} <ArrowRight className="w-3 h-3" />
          </a>
        ) : null}
        {canOpenComparator ? (
          <>
            <button
              type="button"
              disabled={alternativesLoading}
              onClick={openComparator}
              className="ip-button-secondary inline-flex items-center gap-1 disabled:opacity-60"
            >
              {alternativesLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> {t.creatingSheet}</> : t.findAlternatives}
            </button>
            <button
              type="button"
              disabled={alternativesLoading}
              onClick={openComparator}
              className="ip-button-tertiary inline-flex items-center gap-1 border border-[#ea580c]/35 bg-[#ea580c]/10 hover:bg-[#ea580c]/15 disabled:opacity-60"
            >
              <GitCompareArrows className="w-3 h-3" /> {t.compare}
            </button>
          </>
        ) : canCompareReference ? (
          <>
            <button
              type="button"
              disabled={compareLoading}
              onClick={async () => {
                setCompareLoading(true);
                setCompareError('');
                try {
                  const response = await compareReferenceIndustrialpedia({
                    manufacturer: 'Festo',
                    partNumber: result.part_number || result.product_identity?.part_number || '',
                    category: inferReferenceCategory(),
                    specifications: referenceSpecs,
                    limit: 5
                  });
                  navigate('/comparar-referencia', { state: { reference: response.reference, result: response.result } });
                } catch (e) {
                  setCompareError(e?.message || 'No se pudo comparar esta referencia.');
                } finally {
                  setCompareLoading(false);
                }
              }}
              className="ip-button-secondary inline-flex items-center gap-1 disabled:opacity-60"
            >
              {t.findAlternatives}
            </button>
            <button
              type="button"
              disabled={compareLoading}
              onClick={async () => {
                setCompareLoading(true);
                setCompareError('');
                try {
                  const response = await compareReferenceIndustrialpedia({
                    manufacturer: 'Festo',
                    partNumber: result.part_number || result.product_identity?.part_number || '',
                    category: inferReferenceCategory(),
                    specifications: referenceSpecs,
                    limit: 5
                  });
                  navigate('/comparar-referencia', { state: { reference: response.reference, result: response.result } });
                } catch (e) {
                  setCompareError(e?.message || 'No se pudo comparar esta referencia.');
                } finally {
                  setCompareLoading(false);
                }
              }}
              className="ip-button-tertiary inline-flex items-center gap-1 border border-[#ea580c]/35 bg-[#ea580c]/10 hover:bg-[#ea580c]/15 disabled:opacity-60"
            >
              {compareLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> {t.comparing}</> : <><GitCompareArrows className="w-3 h-3" /> {t.compare}</>}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setCompareError('Esta referencia todavía no tiene una identidad técnica suficiente para buscar alternativas.')} className="ip-button-tertiary border border-white/10 hover:bg-white/[0.05]">{t.findAlternatives}</button>
        )}
      </div>

      {imagePreviewOpen && isUsableImageUrl(imageSrc) && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen de ${result.part_number || 'la pieza'}`}
          onClick={() => setImagePreviewOpen(false)}
        >
          <div className="relative w-full max-w-4xl max-h-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImagePreviewOpen(false)}
              className="self-end mb-3 px-5 py-3 rounded-lg bg-white text-black font-semibold text-base"
            >
              Cerrar
            </button>
            <img
              src={imageSrc}
              alt={`Imagen de ${result.part_number || 'la pieza'}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg bg-white p-2"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
}