import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getPartIndustrialpedia } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import SpecList from '@/components/part/SpecList';
import TraceabilityChain from '@/components/part/TraceabilityChain';

const STATE_LABELS = {
  published: { label: 'Publicado', cls: 'text-[#47bcb6] bg-[#47bcb6]/10' },
  validated: { label: 'Validado', cls: 'text-[#5a9cd9] bg-[#5a9cd9]/10' },
  incomplete: { label: 'Incompleto', cls: 'text-[#e68a00] bg-[#e68a00]/10' },
  rejected: { label: 'Rechazado', cls: 'text-red-400 bg-red-400/10' },
  processed: { label: 'Procesado', cls: 'text-white/50 bg-white/10' }
};

function groupBy(list, keyFn) {
  const m = {};
  list.forEach((i) => { const k = keyFn(i); (m[k] = m[k] || []).push(i); });
  return m;
}

function isTechnicalDisplaySpec(spec) {
  const attribute = String(spec?.attribute_name || spec?.attribute || '').trim();
  if (!attribute) return false;
  // Inventario/comercio no pertenece a la ficha técnica de una refacción.
  return !/^(?:stock|inventory|availability|available|in stock|out of stock|quantity|qty|price|cost|msrp|list price|sale price|lead time|delivery|shipping|order status|cart|sku)$/i.test(attribute);
}

export default function Parte() {
  const { id } = useParams();
  const [part, setPart] = useState(null);
  const [specs, setSpecs] = useState([]);
  const [evidenceBySpec, setEvidenceBySpec] = useState({});
  const [provenanceBySpec, setProvenanceBySpec] = useState({});
  const [docs, setDocs] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // La ficha debe leer el mismo Knowledge Core que BUSCAR.
        // No volver a consultar entidades legacy de Base44 para el componente.
        const apiResponse = await getPartIndustrialpedia(id);
        const p = apiResponse?.part;
        if (!p) throw new Error('part_not_found');
        const normalizedPart = {
          id: p.id,
          part_number: p.part_number,
          manufacturer_name: p.manufacturer || '',
          category: p.category || '',
          description: p.description || p.name || '',
          validation_state: p.status || 'processed'
        };
        setPart(normalizedPart);

        const rawSpecs = p.specifications && typeof p.specifications === 'object' ? p.specifications : {};
        const specList = Object.entries(rawSpecs)
          .map(([attribute, raw]) => {
            const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.value ?? raw : raw;
            const unit = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.unit ?? null : null;
            return { id: `${p.id}:${attribute}`, attribute_name: attribute, value, unit, source_id: null };
          })
          .filter(isTechnicalDisplaySpec);
        setSpecs(specList);
        setEvidenceBySpec({});
        setProvenanceBySpec({});
        setDocs([]);
        setSources([]);
      } catch (e) {
        setPart(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <div className="min-h-screen bg-[#0a0e12] grid-bg flex items-center justify-center text-white/40 text-sm">Cargando componente…</div>;
  }
  if (!part) {
    return (
      <div className="min-h-screen bg-[#0a0e12] grid-bg flex flex-col items-center justify-center gap-3">
        <p className="text-white/50 text-sm">Componente no encontrado o no publicado.</p>
        <Link to="/buscar" className="text-[#5a9cd9] text-sm hover:underline">← Volver a BUSCAR</Link>
      </div>
    );
  }

  const st = STATE_LABELS[part.validation_state] || STATE_LABELS.processed;
  const hasAnyEvidence = Object.values(evidenceBySpec).flat().length > 0;

  return (
    <div className="min-h-screen bg-[#0a0e12] grid-bg">
      <header className="sticky top-0 z-30 bg-[#0a0e12]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <Link to="/buscar" className="flex items-center gap-2 text-white/60 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> Volver a BUSCAR
        </Link>
      </header>

      <main className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        <div className="bg-[#161a20] border border-white/10 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h1 className="text-white font-bold text-lg">{part.part_number}</h1>
              <div className="text-white/50 text-sm">{part.manufacturer_name}{part.category ? ` · ${part.category}` : ''}</div>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded ${st.cls} shrink-0`}>{st.label}</span>
          </div>
          {part.description && <p className="text-white/55 text-sm leading-relaxed mt-2">{part.description}</p>}
          <div className="flex items-center gap-2 mt-3 text-[11px]">
            {hasAnyEvidence ? (
              <span className="flex items-center gap-1 text-[#47bcb6]"><ShieldCheck className="w-3.5 h-3.5" /> trazabilidad con evidencia</span>
            ) : (
              <span className="flex items-center gap-1 text-[#e68a00]"><AlertCircle className="w-3.5 h-3.5" /> sin evidencia documental</span>
            )}
          </div>
        </div>

        <TraceabilityChain counts={{ parts: 1, specs: specs.length, provenance: Object.values(provenanceBySpec).flat().length, evidence: Object.values(evidenceBySpec).flat().length, documents: docs.length, sources: sources.length }} />

        <div>
          <h2 className="text-white font-semibold text-sm mb-3">Especificaciones</h2>
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

        <div className="flex gap-2 pt-2">
          <button disabled title="Pilar ENCONTRAR — próxima iteración" className="flex-1 text-white/60 text-xs font-medium px-3 py-2 rounded-lg border border-white/15 cursor-not-allowed opacity-60">Encontrar alternativas</button>
          <Link to={`/comparar/${id}`} className="flex-1 text-center text-white text-xs font-semibold px-3 py-2 rounded-lg border border-[#5a9cd9]/40 bg-[#5a9cd9]/10 hover:bg-[#5a9cd9]/20 transition-colors">Comparar</Link>
        </div>
      </main>
    </div>
  );
}