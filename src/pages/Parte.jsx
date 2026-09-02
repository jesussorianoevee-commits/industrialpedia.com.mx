import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, ShieldCheck, AlertCircle } from 'lucide-react';
import { getPartIndustrialpedia } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { localizeProductName, localizeSpecAttribute, localizeSpecValue, localizeTechnicalText, useLanguage } from '@/lib/i18n';
import IndustrialpediaLoader from '@/components/ui/IndustrialpediaLoader';
import SpecList from '@/components/part/SpecList';
import UnclassifiedSpecs from '@/components/part/UnclassifiedSpecs';
import TraceabilityChain from '@/components/part/TraceabilityChain';
import CompatibilityCommunity from '@/components/part/CompatibilityCommunity';
import { getDisplayPartReference } from '@/lib/partIdentity';
import { normalizeImageUrl, resolveProductImage, clearProductImageCache } from '@/lib/productImage';

const STATE_LABELS = {
  published: { label: 'Publicado', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' },
  validated: { label: 'Validado', cls: 'text-[#5a9cd9] bg-[#5a9cd9]/10' },
  incomplete: { label: 'Incompleto', cls: 'text-[#e68a00] bg-[#e68a00]/10' },
  rejected: { label: 'Rechazado', cls: 'text-red-400 bg-red-400/10' },
  processed: { label: 'Procesado', cls: 'text-white/50 bg-white/10' },
  verified: { label: 'Verificado', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' }
};

function isTechnicalDisplaySpec(spec) {
  const attribute = String(spec?.attribute_name || spec?.attribute || '').trim();
  if (!attribute) return false;
  // Inventario/comercio no pertenece a la ficha técnica de una refacción.
  return !/^(?:stock|inventory|availability|available|in stock|out of stock|quantity|qty|price|cost|msrp|list price|sale price|lead time|delivery|shipping|order status|cart|sku)$/i.test(attribute);
}

// Muchas fuentes externas entregan la descripción como un bloque de
// "Etiqueta: valor" concatenado. Ese contenido ya se muestra abajo como
// especificaciones estructuradas; repetirlo arriba deja la ficha mezclada entre
// idiomas. Si no existe una traducción localizada, preferimos la estructura
// técnica antes que mostrar un párrafo crudo en otro idioma.
function isSpecificationBlob(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const colonPairs = (value.match(/[^:]{2,80}:\s*[^:]{1,120}/g) || []).length;
  return colonPairs >= 2 || (value.length > 120 && colonPairs >= 1);
}

export default function Parte() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [part, setPart] = useState(null);
  const [specs, setSpecs] = useState([]);
  const [unclassifiedSpecs, setUnclassifiedSpecs] = useState([]);
  const [evidenceBySpec, setEvidenceBySpec] = useState({});
  const [provenanceBySpec, setProvenanceBySpec] = useState({});
  const [docs, setDocs] = useState([]);
  const [sources, setSources] = useState([]);
  const [supplierSources, setSupplierSources] = useState([]);
  const [technicalSources, setTechnicalSources] = useState([]);
  const [partEvidence, setPartEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [expandedPartEvidence, setExpandedPartEvidence] = useState(false);
  const [expandedSupplierSources, setExpandedSupplierSources] = useState(false);
  const [expandedTechnicalSources, setExpandedTechnicalSources] = useState(false);
  const [expandedGeneralSources, setExpandedGeneralSources] = useState(false);
  const { language, t } = useLanguage();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // El id de la ruta es la identidad canónica. Nunca reconstruimos la ficha
        // a partir de un número de parte/modelo: valores como "150mm" pueden ser
        // especificaciones o modelos y no identifican unívocamente el componente.
        let p = null;
        try {
          const apiResponse = await getPartIndustrialpedia(id);
          p = apiResponse?.part || null;
        } catch {
          p = null;
        }
        if (!p) throw new Error('part_not_found');
        // La ficha canónica puede no traer imagen aunque exista una fuente API
        // exacta para la referencia. Resolvemos únicamente por número de parte
        // exacto + fabricante, sin IA ni coincidencias aproximadas.
        const canonicalImage = normalizeImageUrl(p.image_url || p.image?.image_url || p.image?.url || p.primary_image_url || p.product_image_url || '');
        if (!canonicalImage) {
          const acquired = await resolveProductImage({
            partNumber: p.part_number,
            manufacturer: p.manufacturer || p.manufacturer_name || '',
            sourceUrl: p.source_url || p.product_url || p.url || p.source?.url || p.evidence?.[0]?.source?.url || '',
            existingUrl: ''
          });
          if (acquired.image_url) p = { ...p, image_url: acquired.image_url, image_verification_status: acquired.verified ? 'verified' : null };
        } else {
          p = { ...p, image_url: canonicalImage };
        }
        const normalizedPart = {
          id: p.id,
          part_number: p.part_number,
          manufacturer_name: p.manufacturer || '',
          category: localizeTechnicalText(p.category || '', language),
          description: localizeTechnicalText(p.description || p.name || '', language),
          validation_state: p.status || p.validation_state || 'processed',
          display_name: localizeProductName(p.name || p.product_name || p.title || p.part_number || '', language),
          display_reference: getDisplayPartReference({
            part_number: p.part_number,
            name: p.name || p.product_name || p.title || ''
          }),
          original_description: p.description || p.name || '',
          image_url: normalizeImageUrl(p.image_url || p.image?.image_url || p.image?.url || p.product_image_url || ''),
          source_url: p.source_url || p.product_url || p.url || p.source?.url || p.evidence?.[0]?.source?.url || ''
        };
        // La localización del nombre/descripción/categoría ya se calculó arriba
        // de forma determinista (localizeProductName/localizeTechnicalText). No se
        // consulta ninguna traducción generada por IA.
        setPart(normalizedPart);

        // La API canónica devuelve specifications; resultados antiguos de Base44
        // pueden traer únicamente top_specs. Normalizamos ambos contratos aquí
        // para no perder datos técnicos durante la transición.
        const rawSpecs = p.specifications_labeled && typeof p.specifications_labeled === 'object' ? p.specifications_labeled : (p.specifications && typeof p.specifications === 'object' ? p.specifications : {});
        const usesLabeledShape = Boolean(p.specifications_labeled);
        const fallbackSpecs = Array.isArray(p.top_specs) ? p.top_specs : [];
        const specEntries = Object.keys(rawSpecs).length > 0
          ? Object.entries(rawSpecs)
          : fallbackSpecs.map((s) => [s.attribute || s.attribute_name, { value: s.value, unit: s.unit }]);
        const translatedSpecifications = normalizedPart.translation_specifications || {};
        const specList = specEntries
          .filter(([attribute, raw]) => attribute && raw !== null && raw !== undefined && raw !== '')
          .map(([attribute, raw]) => {
            const isObject = raw && typeof raw === 'object' && !Array.isArray(raw);
            // specifications_labeled trae {value, label} desde spec_property_definitions
            // (fuente unica de verdad, ya localizada en el backend). Si por algun
            // motivo no viene labeled (fuente vieja), se cae al mecanismo previo.
            const backendLabel = usesLabeledShape && isObject ? raw.label : null;
            const value = usesLabeledShape && isObject ? raw.value : (isObject ? (raw.value ?? null) : raw);
            const unit = isObject && !usesLabeledShape ? (raw.unit ?? null) : null;
            const localized = translatedSpecifications[attribute];
            const localizedAttribute = backendLabel
              || (localized && typeof localized === 'object'
                ? (localized.attribute || localized.label || localizeSpecAttribute(attribute, language))
                : (typeof localized === 'string' ? localized : localizeSpecAttribute(attribute, language)));
            const localizedValue = localized && typeof localized === 'object'
              ? (localized.value ?? localizeSpecValue(value, language))
              : localizeSpecValue(value, language);
            return {
              id: `${p.id}:${attribute}`,
              attribute_name: localizedAttribute,
              original_attribute_name: attribute,
              original_value: localizedValue,
              original_unit: unit,
              normalized_value: null,
              normalized_unit: null,
              validation_state: p.status || 'processed',
              source_id: null
            };
          })
          .filter(isTechnicalDisplaySpec);
        setSpecs(specList);
        // Datos tecnicos reales pero sin definicion formal en la taxonomia todavia
        // (ningun alias los reconocio). Se muestran aparte, nunca mezclados con
        // specifications verificadas/comparables, para no fingir que son canonicas.
        const unclassifiedRaw = Array.isArray(p.specifications_unclassified) ? p.specifications_unclassified : [];
        setUnclassifiedSpecs(unclassifiedRaw.map((u, i) => ({
          id: `${p.id}:unclassified:${i}`,
          label: u.raw_label,
          value: u.value
        })));
        // Evidence returned by the Knowledge Core is currently part-level.
        // Do not incorrectly attach one identity evidence record to every specification.
        setPartEvidence(Array.isArray(p.evidence) ? p.evidence : []);
        setEvidenceBySpec({});
        setProvenanceBySpec({});
        setDocs([]);
        setSources(Array.isArray(p.provenance?.sources) ? p.provenance.sources : (Array.isArray(p.evidence) ? p.evidence.map((e) => e.source).filter(Boolean) : []));
        setSupplierSources(Array.isArray(p.provenance?.supplier_links) ? p.provenance.supplier_links : []);
        setTechnicalSources(Array.isArray(p.provenance?.technical_sources) ? p.provenance.technical_sources : []);
      } catch (e) {
        setPart(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, language]);

  if (loading) {
    return <IndustrialpediaLoader fullScreen label={t.loadingParts} />;
  }
  if (!part) {
    return (
      <div className="min-h-screen bg-[#0a0e12] grid-bg flex flex-col items-center justify-center gap-3">
        <p className="text-white/50 text-sm">{t.partNotFound}</p>
        <Link to="/buscar" className="text-[#5a9cd9] text-sm hover:underline">← {t.backToSearch}</Link>
      </div>
    );
  }

  const stateBase = STATE_LABELS[part.validation_state] || STATE_LABELS.processed;
  const stateLabelKey = {
    published: 'published', validated: 'validated', incomplete: 'incomplete',
    rejected: 'rejected', processed: 'processed', verified: 'verified'
  }[part.validation_state] || 'processed';
  const st = { ...stateBase, label: t[stateLabelKey] || stateBase.label };
  const hasAnyEvidence = partEvidence.length > 0 || Object.values(evidenceBySpec).flat().length > 0;

  const recoverBrokenImage = async () => {
    const pn = String(part?.part_number || '').trim();
    const manufacturer = part?.manufacturer_name || '';
    if (!pn) {
      setPart((current) => current ? { ...current, image_url: '' } : current);
      return;
    }
    clearProductImageCache(pn, manufacturer);
    try {
      const acquired = await resolveProductImage({
        partNumber: pn,
        manufacturer,
        sourceUrl: part?.source_url || '',
        existingUrl: '',
        forceLookup: true
      });
      const nextUrl = normalizeImageUrl(acquired.image_url);
      if (nextUrl && nextUrl !== part.image_url) {
        setPart((current) => current ? { ...current, image_url: nextUrl } : current);
        return;
      }
    } catch {}
    setPart((current) => current ? { ...current, image_url: '' } : current);
  };

  return (
    <div className="min-h-screen bg-[#0a0e12] grid-bg">
      <header className="sticky top-0 z-30 bg-[#0a0e12]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            // Al volver desde una ficha conservamos exactamente la búsqueda y los
            // parámetros anteriores. Solo usamos /buscar como respaldo si la ficha
            // fue abierta directamente y no existe una pantalla previa en el historial.
            if (window.history.length > 1) navigate(-1);
            else navigate('/buscar', { replace: true });
          }}
          className="flex items-center gap-2 text-white/60 hover:text-white text-sm"
          aria-label={t.backToSearch}
        >
          <ArrowLeft className="w-4 h-4" /> {t.back} a {t.search.toUpperCase()}
        </button>
      </header>

      <main className="px-3 sm:px-4 py-4 sm:py-5 max-w-2xl mx-auto space-y-4 w-full min-w-0">
        <div className="bg-[#161a20] border border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <div className="text-white font-bold text-lg">{part.display_name || part.part_number}</div>
              <h1 className="mt-1 font-mono text-white/75 text-sm break-all">{part.display_reference || part.part_number}</h1>
              <div className="text-white/50 text-sm">{part.manufacturer_name}{part.category ? ` · ${part.category}` : ''}</div>
            </div>
            <div className="flex items-start gap-2 shrink-0">
              {part.image_url && <button
                type="button"
                onClick={() => setImagePreviewOpen(true)}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg bg-white flex items-center justify-center overflow-hidden border border-white/10 cursor-pointer hover:border-[#5a9cd9] focus:outline-none focus:ring-2 focus:ring-[#5a9cd9]"
                aria-label={`${t.enlargeImage}: ${part.part_number || t.partNumber}`}
                title={t.tapImageToEnlarge}
              >
                <img src={part.image_url} alt={part.part_number || ''} className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" onError={recoverBrokenImage} />
              </button>}
              <span className={`text-[10px] px-2 py-0.5 rounded ${st.cls} shrink-0`}>{st.label}</span>
            </div>
          </div>
          {part.description && !isSpecificationBlob(part.description) && <p className="text-white/55 text-sm leading-relaxed mt-2">{part.description}</p>}
          <div className="flex items-center gap-2 mt-3 text-[11px]">
            {hasAnyEvidence ? (
              <span className="flex items-center gap-1 text-[#47bcb6]"><ShieldCheck className="w-3.5 h-3.5" /> {partEvidence.length} {t.evidenceCount}</span>
            ) : (
              <span className="flex items-center gap-1 text-[#e68a00]"><AlertCircle className="w-3.5 h-3.5" /> {t.noEvidence}</span>
            )}
          </div>
        </div>

        <TraceabilityChain counts={{ parts: 1, specs: specs.length, provenance: Object.values(provenanceBySpec).flat().length, evidence: partEvidence.length + Object.values(evidenceBySpec).flat().length, documents: docs.length, sources: sources.length }} />

        <CompatibilityCommunity part={part} />

        {partEvidence.length > 0 && (
          <section className="bg-[#161a20] border border-white/10 rounded-xl p-4">
            <div className="text-white font-semibold text-sm mb-2">{t.componentEvidence}</div>
            <div className="space-y-2">
              {partEvidence.slice(0, expandedPartEvidence ? partEvidence.length : 2).map((ev) => (
                <div key={ev.id} className="text-[11px] text-white/55 leading-relaxed">
                  <div>{ev.evidence}</div>
                  {ev.source?.url && <a href={ev.source.url} target="_blank" rel="noreferrer" className="text-[#5a9cd9] hover:underline mt-1 inline-block">{ev.source.name || ev.source.url}</a>}
                </div>
              ))}
              {partEvidence.length > 2 && (
                <div className="flex justify-center border-t border-white/10 pt-2">
                  <button
                    type="button"
                    onClick={() => setExpandedPartEvidence((value) => !value)}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold text-[#65a9e6] hover:bg-[#65a9e6]/[0.08] transition-colors focus:outline-none focus:ring-1 focus:ring-[#65a9e6]/60"
                    aria-expanded={expandedPartEvidence}
                  >
                    {expandedPartEvidence ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {expandedPartEvidence ? 'Ver menos' : `Ver más · ${partEvidence.length - 2} evidencias`}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        <div>
          <h2 className="text-white font-semibold text-sm mb-3">{t.technicalSpecs}</h2>
          <SpecList specs={specs} evidenceBySpec={evidenceBySpec} provenanceBySpec={provenanceBySpec} />
          <UnclassifiedSpecs items={unclassifiedSpecs} />
        </div>

        {docs.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-sm mb-2">{t.document}</h2>
            <div className="space-y-2">
              {docs.map((d) => (
                <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" className="block bg-[#161a20] border border-white/10 rounded-lg p-3 hover:border-white/20">
                  <div className="text-white/70 text-xs truncate">{d.title || d.file_url}</div>
                  {d.file_url && <div className="text-[#5a9cd9] text-[11px] mt-0.5 truncate">{d.file_url}</div>}
                  <div className="text-white/30 text-[10px] mt-1">{d.document_type || 'datasheet'} · {d.status}</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {(supplierSources.length > 0 || technicalSources.length > 0 || sources.length > 0) && (
          <section className="bg-[#161a20] border border-white/10 rounded-xl p-4 space-y-4">
            <div>
              <h2 className="text-white font-semibold text-sm mb-1">{t.sourcesTitle} y trazabilidad</h2>
              <p className="text-white/40 text-[11px] leading-relaxed">Aquí puedes ver de dónde provino el componente y qué fuentes respaldan sus datos técnicos.</p>
            </div>

            {supplierSources.length > 0 && (
              <div>
                <div className="text-white/70 text-xs font-semibold mb-2">{t.distributor}</div>
                <div className="space-y-2">
                  {supplierSources.slice(0, expandedSupplierSources ? supplierSources.length : 3).map((s) => (
                    <a key={s.id || s.url} href={s.product_url || s.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-[#5a9cd9]/25 bg-[#5a9cd9]/5 p-3 hover:border-[#5a9cd9]/50">
                      <div className="text-white/80 text-xs font-medium">{s.provider_name || t.distributor}</div>
                      <div className="text-[#5a9cd9] text-[11px] mt-1 truncate">{s.product_url || s.url}</div>
                      {s.retrieved_at && <div className="text-white/30 text-[10px] mt-1">{s.retrieved_at}</div>}
                    </a>
                  ))}
                  {supplierSources.length > 3 && <button type="button" onClick={() => setExpandedSupplierSources((value) => !value)} className="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold text-[#65a9e6] hover:bg-[#65a9e6]/[0.08] transition-colors" aria-expanded={expandedSupplierSources}>{expandedSupplierSources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{expandedSupplierSources ? 'Ver menos' : `Ver más · ${supplierSources.length - 3} enlaces`}</button>}
                </div>
              </div>
            )}

            {technicalSources.length > 0 && (
              <div>
                <div className="text-white/70 text-xs font-semibold mb-2">{t.officialManufacturer}</div>
                <div className="space-y-2">
                  {technicalSources.slice(0, expandedTechnicalSources ? technicalSources.length : 3).map((s) => (
                    <a key={s.id || s.url} href={s.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/10 p-3 hover:border-white/20">
                      <div className="text-white/70 text-xs">{s.provider_name || t.officialManufacturer}</div>
                      <div className="text-[#5a9cd9] text-[11px] mt-1 truncate">{s.url}</div>
                      {s.retrieved_at && <div className="text-white/30 text-[10px] mt-1">{s.retrieved_at}</div>}
                    </a>
                  ))}
                  {technicalSources.length > 3 && <button type="button" onClick={() => setExpandedTechnicalSources((value) => !value)} className="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold text-[#65a9e6] hover:bg-[#65a9e6]/[0.08] transition-colors" aria-expanded={expandedTechnicalSources}>{expandedTechnicalSources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{expandedTechnicalSources ? 'Ver menos' : `Ver más · ${technicalSources.length - 3} enlaces`}</button>}
                </div>
              </div>
            )}

            {sources.length > 0 && technicalSources.length === 0 && supplierSources.length === 0 && (
              <div>
                <div className="text-white/70 text-xs font-semibold mb-2">{t.sourcesTitle}</div>
                <div className="space-y-2">
                  {sources.slice(0, expandedGeneralSources ? sources.length : 3).map((s) => (
                    <a key={s.id || s.url} href={s.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/10 p-3 text-white/60 text-xs hover:border-white/20">{s.url}</a>
                  ))}
                  {sources.length > 3 && <button type="button" onClick={() => setExpandedGeneralSources((value) => !value)} className="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold text-[#65a9e6] hover:bg-[#65a9e6]/[0.08] transition-colors" aria-expanded={expandedGeneralSources}>{expandedGeneralSources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{expandedGeneralSources ? 'Ver menos' : `Ver más · ${sources.length - 3} enlaces`}</button>}
                </div>
              </div>
            )}
          </section>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate(`/comparar/${encodeURIComponent(part.id)}?pn=${encodeURIComponent(part.part_number || '')}`)}
            className="flex-1 text-white text-xs font-semibold px-3 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
          >
            {t.findAlternatives}
          </button>
          <Link to={`/comparar/${encodeURIComponent(part.id)}?pn=${encodeURIComponent(part.part_number || '')}`} className="flex-1 text-center text-white text-xs font-semibold px-3 py-2 rounded-lg border border-[#5a9cd9]/40 bg-[#5a9cd9]/10 hover:bg-[#5a9cd9]/20 transition-colors">{t.compare}</Link>
        </div>
      </main>

      {imagePreviewOpen && part.image_url && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${t.enlargeImage}: ${part.part_number || t.partNumber}`}
          onClick={() => setImagePreviewOpen(false)}
        >
          <div className="relative w-full max-w-4xl max-h-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImagePreviewOpen(false)}
              className="self-end mb-3 px-5 py-3 rounded-lg bg-white text-black font-semibold text-base"
            >
              {t.closeImage}
            </button>
            <img
              src={part.image_url}
              alt={`${t.imageOf} ${part.part_number || t.partNumber}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg bg-white p-2"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
}