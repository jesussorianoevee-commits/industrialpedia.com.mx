import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Users, LogIn, Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export default function CompatibilityCommunity({ part }) {
  const { user, isAuthenticated } = useAuth();
  const [targetPartNumber, setTargetPartNumber] = useState('');
  const [outcome, setOutcome] = useState('confirmed');
  const [experienceType, setExperienceType] = useState('field_use');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const canSubmit = useMemo(() => Boolean(isAuthenticated && user?.id && part?.id && targetPartNumber.trim()), [isAuthenticated, user?.id, part?.id, targetPartNumber]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setMessage('');
    try {
      const normalizedTarget = targetPartNumber.trim().toUpperCase();
      const existing = await base44.entities.CompatibilityConfirmation.filter({
        source_part_id: part.id,
        target_part_number: normalizedTarget,
        contributor_user_id: user.id
      }, null, 5, 0);
      if (Array.isArray(existing) && existing.length) {
        setMessage('Ya registraste una experiencia para esta combinación.');
        return;
      }
      await base44.entities.CompatibilityConfirmation.create({
        source_part_id: part.id,
        target_part_number: normalizedTarget,
        contributor_user_id: user.id,
        outcome,
        experience_type: experienceType,
        note: note.trim() || undefined,
        created_at_client: new Date().toISOString()
      });
      setMessage('Tu experiencia quedó registrada como evidencia comunitaria.');
      setTargetPartNumber('');
      setNote('');
    } catch {
      setMessage('No se pudo registrar la confirmación en este momento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-[#161a20] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[#47bcb6]/10 p-2 text-[#47bcb6]"><Users className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">Compatibilidad confirmada por la comunidad</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/45">Las experiencias de usuarios se registran como evidencia comunitaria y permanecen separadas de la información oficial y de la evidencia técnica canónica.</p>
        </div>
      </div>

      {!isAuthenticated ? (
        <div className="mt-4 rounded-lg border border-[#5a9cd9]/20 bg-[#5a9cd9]/[0.05] p-3">
          <div className="text-xs text-white/70">Solo los usuarios con una cuenta pueden confirmar o reportar compatibilidad.</div>
          <Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#5a9cd9] px-3 py-2 text-xs font-semibold text-[#080d12] hover:bg-[#78b5ea]">
            <LogIn className="h-3.5 w-3.5" /> Iniciar sesión para participar
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-white/35">Número de parte con el que tienes experiencia</span>
              <input value={targetPartNumber} onChange={(e) => setTargetPartNumber(e.target.value)} placeholder="Ej. ABC-123" className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a0e12] px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-[#47bcb6]/60" required />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/35">Resultado</span>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a0e12] px-3 py-2.5 text-sm text-white outline-none">
                <option value="confirmed">Compatible / funcionó</option>
                <option value="incompatible">Incompatible / no funcionó</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/35">Tipo de experiencia</span>
              <select value={experienceType} onChange={(e) => setExperienceType(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a0e12] px-3 py-2.5 text-sm text-white outline-none">
                <option value="field_use">Uso en campo</option>
                <option value="installation">Instalación</option>
                <option value="technical_review">Revisión técnica</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-white/35">Nota (opcional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="Comparte únicamente el contexto técnico relevante." className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-[#0a0e12] px-3 py-2.5 text-sm text-white outline-none focus:border-[#47bcb6]/60" />
          </label>
          <button type="submit" disabled={!canSubmit || loading} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#47bcb6] px-4 py-2.5 text-xs font-semibold text-[#071012] hover:bg-[#62ccc6] disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : outcome === 'confirmed' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {loading ? 'Registrando...' : 'Registrar experiencia'}
          </button>
          {message && <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#47bcb6]" />{message}</div>}
        </form>
      )}
    </section>
  );
}
