import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Loader2, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { decideIndustrialpedia } from '../../base44/shared/supabaseIndustrialpediaApi.js';
import { useLanguage } from '@/lib/i18n';

const STATUS = {
  recommended: { label: 'RECOMENDADA', cls: 'text-[#16c79a] border-[#16c79a]/30 bg-[#16c79a]/[0.05]', icon: CheckCircle2 },
  suitable: { label: 'CUMPLE', cls: 'text-[#16c79a] border-[#16c79a]/30 bg-[#16c79a]/[0.05]', icon: CheckCircle2 },
  review: { label: 'REQUIERE REVISIÓN', cls: 'text-amber-300 border-amber-300/30 bg-amber-300/[0.05]', icon: AlertTriangle },
  insufficient: { label: 'EVIDENCIA INSUFICIENTE', cls: 'text-white/45 border-white/10 bg-white/[0.02]', icon: XCircle },
  rejected: { label: 'NO CUMPLE', cls: 'text-red-300 border-red-400/30 bg-red-400/[0.05]', icon: XCircle }
};

function normalizeRows(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter(([k, v]) => String(k).trim() && v !== null && v !== undefined && String(v).trim());
}

function statusFor(result) {
  const raw = String(result?.decision || result?.state || result?.status || '').toLowerCase();
  if (STATUS[raw]) return STATUS[raw];
  if (result?.eligible === true || result?.meets_requirements === true || result?.match === true) return STATUS.suitable;
  if (result?.eligible === false || result?.meets_requirements === false) return STATUS.rejected;
  return STATUS.review;
}

export default function Decidir() {
  const [family, setFamily] = useState('');
  const [requirements, setRequirements] = useState([{ key: '', value: '' }]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  const cleanRequirements = useMemo(() => Object.fromEntries(requirements.filter((r) => r.key.trim() && r.value.trim()).map((r) => [r.key.trim(), r.value.trim()])), [requirements]);

  const addRequirement = () => setRequirements((prev) => [...prev, { key: '', value: '' }]);
  const removeRequirement = (index) => setRequirements((prev) => prev.length === 1 ? [{ key: '', value: '' }] : prev.filter((_, i) => i !== index));
  const updateRequirement = (index, field, value) => setRequirements((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));

  const decide = async (e) => {
    e.preventDefault();
    setError('');
    setData(null);
    if (!family.trim()) return setError('Indica la familia técnica del componente.');
    if (!Object.keys(cleanRequirements).length) return setError('Agrega al menos un requisito técnico.');
    setLoading(true);
    try {
      const result = await decideIndustrialpedia(family.trim(), cleanRequirements, 10);
      setData(result);
    } catch (err) {
      setError(err?.message || 'No se pudo ejecutar la decisión técnica.');
    } finally {
      setLoading(false);
    }
  };

  const results = Array.isArray(data?.results) ? data.results : [];

  return (
    <div className="min-h-screen bg-[#080d12] text-white">
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#080d12]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-4">
          <Link to="/" className="rounded-lg border border-white/10 p-2 text-white/60 hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="font-mono text-sm tracking-[0.18em]"><span className="font-semibold">INDUSTRIAL</span><span className="text-[#168fd5]">PEDIA</span></div>
          <span className="text-xs text-white/35">{t.technicalDecision}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 sm:px-4 py-5 sm:py-8 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t.decisionTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/45">{t.decisionSubtitle}</p>
        </div>

        <form onSubmit={decide} className="rounded-xl border border-white/10 bg-[#0d141b] p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_2fr] min-w-0">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/35">{t.technicalFamily}</span>
              <input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="Ej. sensor, cilindro, motor" className="mt-2 w-full rounded-lg border border-white/10 bg-[#080d12] px-3 py-2.5 text-sm text-white outline-none focus:border-[#65a9e6]/50" />
            </label>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-white/35">{t.requirements}</span>
                <button type="button" onClick={addRequirement} className="inline-flex items-center gap-1 text-[10px] text-[#65a9e6] hover:text-white"><Plus className="h-3.5 w-3.5" /> {t.add}</button>
              </div>
              <div className="mt-2 space-y-2">
                {requirements.map((row, index) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                    <input value={row.key} onChange={(e) => updateRequirement(index, 'key', e.target.value)} placeholder={t.attribute} className="min-w-0 rounded-lg border border-white/10 bg-[#080d12] px-3 py-2 text-xs text-white outline-none focus:border-[#65a9e6]/50" />
                    <input value={row.value} onChange={(e) => updateRequirement(index, 'value', e.target.value)} placeholder={t.requiredValue} className="min-w-0 rounded-lg border border-white/10 bg-[#080d12] px-3 py-2 text-xs text-white outline-none focus:border-[#65a9e6]/50" />
                    <button type="button" onClick={() => removeRequirement(index)} aria-label="Eliminar requisito" className="rounded-lg border border-white/10 px-2 text-white/30 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-xs text-amber-100/75">{error}</div>}
          <button type="submit" disabled={loading} className="mt-5 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#65a9e6] px-5 py-2.5 text-xs font-semibold text-[#080d12] hover:bg-[#78b5ea] disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {loading ? t.evaluating : t.takeDecision}
          </button>
        </form>

        {data && (
          <section className="mt-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{t.result}</h2>
                <p className="mt-1 text-[10px] text-white/30">{data.count ?? results.length} resultado(s) evaluado(s) · fuente: Knowledge Core</p>
              </div>
              <span className="rounded-md border border-[#16c79a]/20 bg-[#16c79a]/[0.04] px-2 py-1 text-[9px] uppercase tracking-wider text-[#16c79a]/75">Determinístico</span>
            </div>

            {results.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#0d141b] p-7 text-center">
                <XCircle className="mx-auto h-5 w-5 text-white/25" />
                <div className="mt-2 text-sm text-white/55">{t.noResults}</div>
                <div className="mt-1 text-[10px] text-white/30">Esto no significa que no exista una solución; significa que el Knowledge Core no tiene evidencia suficiente para esta consulta.</div>
              </div>
            ) : results.map((result, index) => {
              const meta = statusFor(result);
              const Icon = meta.icon;
              const details = normalizeRows(result.specifications || result.specs || result.attributes || result.matched_requirements);
              return (
                <article key={result.id || result.part_id || result.part_number || index} className="rounded-xl border border-white/10 bg-[#0d141b] p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-mono text-sm text-[#65a9e6] break-all">{result.part_number || result.part_id || 'Candidato sin número de parte'}</div>
                      <div className="mt-1 text-sm text-white/70">{result.name || result.product_name || result.description || 'Componente'}</div>
                      {result.manufacturer && <div className="mt-1 text-[11px] text-white/35">{result.manufacturer}</div>}
                    </div>
                    <div className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold shrink-0 ${meta.cls}`}><Icon className="h-3.5 w-3.5" />{meta.label}</div>
                  </div>
                  {result.reason && <div className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-white/50">{result.reason}</div>}
                  {details.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{details.slice(0, 12).map(([key, value]) => <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><div className="text-[9px] uppercase tracking-wider text-white/25">{key}</div><div className="mt-1 text-xs font-mono text-white/75 break-words">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</div></div>)}</div>}
                  {result.source_url && <a href={result.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[10px] text-[#65a9e6] hover:underline">Ver fuente →</a>}
                </article>
              );
            })}
          </section>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.015] p-3 text-[10px] leading-relaxed text-white/30">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16c79a]/60" />
          <span>Decidir está separado de Comparar: aquí se evalúan requisitos contra candidatos del Knowledge Core. No se declara automáticamente que una pieza sea segura, certificada o intercambiable si falta evidencia crítica.</span>
        </div>
      </main>
    </div>
  );
}
