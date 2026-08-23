import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getPartIndustrialpedia } from '../../../base44/shared/supabaseIndustrialpediaApi.js';
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
  const [compareLoading, setCompareLoading] = useState(false);
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
  const displayCategory = result.category && !/^category$/i.test(String(result.category).trim()) ? localizeTechnicalTerm(result.category, language) : '';
  const canCompareReference = isFestoDiscovery && inferReferenceCategory() && Object.keys(referenceSpecs).length >= 2;

  const stateLabel = { published: t.published, validated: t.validated, incomplete: t.incomplete, rejected: t.rejected, processed: t.processed }[STATE_LABELS[result.validation_state]] || t.processed;
  const st = isVerified
    ? { label: t.verified, cls: 'text-[#47bcb6] bg-[#47bcb6]/10' }
    : result.discovery_state === 'discovered'
      ? { label: t.foundPendingVerification, cls: 'text-[#e68a00] bg-[#e68a00]/10' }
      : result.discovery_state === 'pending_verification'
        ? { label: t.pendingVerification, cls: 'text-[#e68a00] bg-[#e68a00]/10' }
        : { label: stateLabel, cls: 'text-white/50 bg-white/10' };
  return (
    <div className="bg-[#161a20] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-[0_16px_38px_-30px_rgba(0,0,0,.9)] hover:border-[#5a9cd9]/35 hover:bg-[#181d24] transition-all">
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
        <div className="w-[72px] h-[72px] sm:w-20 sm:h-20 shrink-0 rounded-2xl border border-white/10 bg-[#0f1318] flex items-center justify-center overflow-hidden shadow-inner">
          {isUsableImageUrl(imageSrc) ? (
            <img
              src={imageSrc}
              alt={result.part_number || ''}
              className="w-full h-full object-contain p-1.5"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
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
      {result.translation_status === 'machine_draft' && language !== 'es' && (
        <p className="text-amber-300/60 text-[10px] mb-2">{t.autoTranslation}</p>
      )}
      {result.discovery_state === 'discovered' && (
        <p className="text-white/35 text-[11px] mb-3">
          {result.part_number ? t.foundSourcePart : t.foundSourceNoPart}
        </p>
      )}
      {materializeError && (
        <p className="text-red-300 text-[11px] mb-3">{materializeError}</p>
      )}
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
          <a href={result.source_url} target="_blank" rel="noreferrer" className="text-[#5a9cd9] hover:underline">{t.viewSource}</a>
        )}
        {result.match && !/^category$/i.test(String(result.match).trim()) && (
          <span className="text-white/30 ml-auto capitalize">{result.match.replace(/_/g, ' ')}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-3 border-t border-white/[0.06]">
        {result.id ? (
          <Link
            to={`/parte/${result.id}`}
            className="flex items-center gap-1.5 bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors shadow-sm"
          >
            {t.viewComponent} <ArrowRight className="w-3 h-3" />
          </Link>
        ) : result.catalog_id && result.source_url ? (
          <a
            href={result.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors shadow-sm"
          >
            {t.viewProduct} <ArrowRight className="w-3 h-3" />
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
            {materializing ? t.creatingSheet : t.viewTechnicalSheet} <ArrowRight className="w-3 h-3" />
          </button>
        ) : result.source_url ? (
          <a
            href={result.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 bg-[#5a9cd9] hover:bg-[#4f8fc7] text-[#0a0e12] text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors shadow-sm"
          >
            {t.viewSource} <ArrowRight className="w-3 h-3" />
          </a>
        ) : null}
        <button
          disabled
          title={t.findAlternatives}
          className="text-white/60 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 cursor-not-allowed opacity-60"
        >
          {t.findAlternatives}
        </button>
        {canCompareReference ? (
          <button
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
            className="flex items-center gap-1 text-[#65a9e6] text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#5a9cd9]/40 bg-[#5a9cd9]/10 hover:bg-[#5a9cd9]/20 disabled:opacity-60"
          >
            {compareLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> {t.comparing}</> : <><GitCompareArrows className="w-3 h-3" /> {t.compareAlternatives}</>}
          </button>
        ) : (
          <button disabled title="Se habilita cuando la referencia externa tiene suficientes especificaciones técnicas." className="text-white/60 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 cursor-not-allowed opacity-60">{t.compare}</button>
        )}
      </div>
    </div>
  );
}