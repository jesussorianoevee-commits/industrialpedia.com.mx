import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react';
import { getPartIndustrialpedia } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { useLanguage } from '@/lib/i18n';
import IndustrialpediaLoader from '@/components/ui/IndustrialpediaLoader';
import SpecList from '@/components/part/SpecList';
import TraceabilityChain from '@/components/part/TraceabilityChain';

const STATE_LABELS = {
  published: { label: 'Publicado', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' },
  validated: { label: 'Validado', cls: 'text-[#5a9cd9] bg-[#5a9cd9]/10' },
  incomplete: { label: 'Incompleto', cls: 'text-[#e68a00] bg-[#e68a00]/10' },
  rejected: { label: 'Rechazado', cls: 'text-red-400 bg-red-400/10' },
  processed: { label: 'Procesado', cls: 'text-white/50 bg-white/10' }
};

function isTechnicalDisplaySpec(spec) {
  const attribute = String(spec?.attribute_name || spec?.attribute || '').trim();
  if (!attribute) return false;
  // Inventario/comercio no pertenece a la ficha técnica de una refacción.
  return !/^(?:stock|inventory|availability|available|in stock|out of stock|quantity|qty|price|cost|msrp|list price|sale price|lead time|delivery|shipping|order status|cart|sku)$/i.test(attribute);
}

export default function Parte() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const partNumberHint = searchParams.get('pn') || '';
  const [part, setPart] = useState(null);
  const [specs, setSpecs] = useState([]);
  const [evidenceBySpec, setEvidenceBySpec] = useState({});
  const [provenanceBySpec, setProvenanceBySpec] = useState({});
  const [docs, setDocs] = useState([]);
  const [sources, setSources] = useState([]);
  const [partEvidence, setPartEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const { language, t } = useLanguage();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // La ficha debe leer el mismo Knowledge Core que BUSCAR.
        // No volver a consultar entidades legacy de Base44 para el componente.
        let p = null;
        if (partNumberHint) {
          try {
            const searchResponse = await base44.functions.invoke('IndustrialpediaSearch', {
              q: partNumberHint,
              filters: { validation_states: ['published', 'validated', 'incomplete', 'candidate'] },
              limit: 10,
              offset: 0
            });
            const results = searchResponse?.data?.knowledge_core_results || [];
            p = results.find((r) => r.id === id || r.part_number === partNumberHint) || null;
          } catch {
            p = null;
          }
        }
        if (!p) {
          try {
            const apiResponse = await getPartIndustrialpedia(id);
            p = apiResponse?.part || null;
          } catch {
            p = null;
          }
        }
        if (!p) throw new Error('part_not_found');
        // Completa únicamente la imagen desde la API canónica si el resultado de búsqueda no la trae.
        // No sustituye ni modifica los datos técnicos de la pieza.
        if (!p.image_url && !p.image?.url && !p.image?.image_url && !p.primary_image_url) {
          try {
            const canonicalResponse = await getPartIndustrialpedia(id);
            const canonicalPart = canonicalResponse?.part;
            const canonicalImage = canonicalPart?.image_url || canonicalPart?.image?.image_url || canonicalPart?.image?.url || canonicalPart?.primary_image_url || '';
            if (canonicalImage) p = { ...p, image_url: canonicalImage };
          } catch {
            // La ficha sigue funcionando sin imagen si la fuente canónica no la tiene.
          }
        }
        const normalizedPart = {
          id: p.id,
          part_number: p.part_number,
          manufacturer_name: p.manufacturer || '',
          category: p.category || '',
          description: p.description || p.name || '',
          validation_state: p.status || 'processed',
          display_name: p.name || p.product_name || p.part_number || '',
          original_description: p.description || p.name || '',
          image_url: p.image_url || p.image || p.product_image_url || ''
        };
        try {
          const translations = await base44.entities.PartTranslation.filter(
            { part_id: p.id, language },
            null,
            5,
            0,
            ['name', 'description', 'category', 'subcategory', 'specifications', 'status', 'translation_version']
          );
          const translation = translations?.[0];
          if (translation?.name) {
            normalizedPart.display_name = translation.name;
            normalizedPart.description = translation.description || normalizedPart.description;
            normalizedPart.category = translation.category || normalizedPart.category;
            normalizedPart.subcategory = translation.subcategory || '';
            normalizedPart.translation_specifications = translation.specifications && typeof translation.specifications === 'object' ? translation.specifications : {};
            normalizedPart.translation_status = translation.status || 'machine_draft';
          }
        } catch {
          // Original Knowledge Core content remains the fallback.
        }
        setPart(normalizedPart);

        // La API canónica devuelve specifications; resultados antiguos de Base44
        // pueden traer únicamente top_specs. Normalizamos ambos contratos aquí
        // para no perder datos técnicos durante la transición.
        const rawSpecs = p.specifications && typeof p.specifications === 'object' ? p.specifications : {};
        const fallbackSpecs = Array.isArray(p.top_specs) ? p.top_specs : [];
        const specEntries = Object.keys(rawSpecs).length > 0
          ? Object.entries(rawSpecs)
          : fallbackSpecs.map((s) => [s.attribute || s.attribute_name, { value: s.value, unit: s.unit }]);
        const translatedSpecifications = normalizedPart.translation_specifications || {};
        const specList = specEntries
          .filter(([attribute, raw]) => attribute && raw !== null && raw !== undefined && raw !== '')
          .map(([attribute, raw]) => {
            const isObject = raw && typeof raw === 'object' && !Array.isArray(raw);
            const value = isObject ? (raw.value ?? null) : raw;
            const unit = isObject ? (raw.unit ?? null) : null;
            const localized = translatedSpecifications[attribute];
            const localizedAttribute = localized && typeof localized === 'object' ? (localized.attribute || localized.label || attribute) : (typeof localized === 'string' ? localized : attribute);
            const localizedValue = localized && typeof localized === 'object' ? (localized.value ?? value) : value;
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
        // Evidence returned by the Knowledge Core is currently part-level.
        // Do not incorrectly attach one identity evidence record to every specification.
        setPartEvidence(Array.isArray(p.evidence) ? p.evidence : []);
        setEvidenceBySpec({});
        setProvenanceBySpec({});
        setDocs([]);
        setSources(Array.isArray(p.evidence) ? p.evidence.map((e) => e.source).filter(Boolean) : []);
      } catch (e) {
        setPart(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, partNumberHint, language]);

  if (loading) {
    return <IndustrialpediaLoader fullScreen label={t.loadingParts} />;
  }
  if (!part) {
    return (
      <div className="min-h-screen bg-[#0a0e12] grid-bg flex flex-col items-center justify-center gap-3">
        <p className="text-white/50 text-sm">{t.partNotFound}</p>
        <Link to="/buscar" className="text-[#5a9cd9] text-sm hover:underline">← Volver a BUSCAR</Link>
      </div>
    );
  }

  const st = STATE_LABELS[part.validation_state] || STATE_LABELS.processed;
  const hasAnyEvidence = partEvidence.length > 0 || Object.values(evidenceBySpec).flat().length > 0;

  return (
    <div className="min-h-screen bg-[#0a0e12] grid-bg">
      <header className="sticky top-0 z-30 bg-[#0a0e12]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <button type="button" onClick={() => window.history.back()} className="flex items-center gap-2 text-white/60 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> {t.back} a {t.search.toUpperCase()}
        </button>
      </header>

      <main className="px-3 sm:px-4 py-4 sm:py-5 max-w-2xl mx-auto space-y-4 w-full min-w-0">
        <div className="bg-[#161a20] border border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <div className="text-white font-bold text-lg">{part.display_name || part.part_number}</div>
              <h1 className="mt-1 font-mono text-white/75 text-sm break-all">{part.part_number}</h1>
              <div className="text-white/50 text-sm">{part.manufacturer_name}{part.category ? ` · ${part.category}` : ''}</div>
            </div>
            <div className="flex items-start gap-2 shrink-0">
              {part.image_url && <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg bg-white flex items-center justify-center overflow-hidden border border-white/10">
                <img src={part.image_url} alt={part.part_number || ''} className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />
              </div>}
              <span className={`text-[10px] px-2 py-0.5 rounded ${st.cls} shrink-0`}>{st.label}</span>
            </div>
          </div>
          {part.description && <p className="text-white/55 text-sm leading-relaxed mt-2">{part.description}</p>}
          {part.translation_status === 'machine_draft' && language !== 'es' && (
            <div className="mt-2 text-[10px] text-amber-300/60">{t.autoTranslation}</div>
          )}
          <div className="flex items-center gap-2 mt-3 text-[11px]">
            {hasAnyEvidence ? (
              <span className="flex items-center gap-1 text-[#47bcb6]"><ShieldCheck className="w-3.5 h-3.5" /> {partEvidence.length} evidencia(s) del componente</span>
            ) : (
              <span className="flex items-center gap-1 text-[#e68a00]"><AlertCircle className="w-3.5 h-3.5" /> {t.noEvidence}</span>
            )}
          </div>
        </div>

        <TraceabilityChain counts={{ parts: 1, specs: specs.length, provenance: Object.values(provenanceBySpec).flat().length, evidence: partEvidence.length + Object.values(evidenceBySpec).flat().length, documents: docs.length, sources: sources.length }} />

        {partEvidence.length > 0 && (
          <section className="bg-[#161a20] border border-white/10 rounded-xl p-4">
            <div className="text-white font-semibold text-sm mb-2">{t.componentEvidence}</div>
            <div className="space-y-2">
              {partEvidence.map((ev) => (
                <div key={ev.id} className="text-[11px] text-white/55 leading-relaxed">
                  <div>{ev.evidence}</div>
                  {ev.source?.url && <a href={ev.source.url} target="_blank" rel="noreferrer" className="text-[#5a9cd9] hover:underline mt-1 inline-block">{ev.source.name || ev.source.url}</a>}
                </div>
              ))}
            </div>
          </section>
        )}

        <div>
          <h2 className="text-white font-semibold text-sm mb-3">{t.technicalSpecs}</h2>
          <SpecList specs={specs} evidenceBySpec={evidenceBySpec} provenanceBySpec={provenanceBySpec} />
        </div>

        {docs.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-sm mb-2">Documento</h2>
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

        {sources.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-sm mb-2">Fuentes</h2>
            <div className="space-y-2">
              {sources.map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="block bg-[#161a20] border border-white/10 rounded-lg p-3 text-white/60 text-xs hover:border-white/20">
                  {s.url}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button disabled title="Pilar ENCONTRAR — próxima iteración" className="flex-1 text-white/60 text-xs font-medium px-3 py-2 rounded-lg border border-white/15 cursor-not-allowed opacity-60">Encontrar alternativas</button>
          <Link to={`/comparar/${part.id}?pn=${encodeURIComponent(part.part_number)}`} className="flex-1 text-center text-white text-xs font-semibold px-3 py-2 rounded-lg border border-[#5a9cd9]/40 bg-[#5a9cd9]/10 hover:bg-[#5a9cd9]/20 transition-colors">{t.compare}</Link>
        </div>
      </main>
    </div>
  );
}