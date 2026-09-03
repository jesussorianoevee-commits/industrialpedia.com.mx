import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Users, LogIn, Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n';

export default function CompatibilityCommunity({ part }) {
  const { user, isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const [targetPartNumber, setTargetPartNumber] = useState('');
  const [outcome, setOutcome] = useState('confirmed');
  const [experienceType, setExperienceType] = useState('field_use');
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState({ positive: 0, negative: 0, contributors: 0 });
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const sourcePartId = part?.id || null;
  const canSubmit = useMemo(
    () => Boolean(isAuthenticated && user?.id && sourcePartId && targetPartNumber.trim()),
    [isAuthenticated, user?.id, sourcePartId, targetPartNumber]
  );

  const loadSummary = async () => {
    if (!sourcePartId) return;
    setLoadingSummary(true);
    try {
      const { data, error } = await supabase
        .from('compatibility_community_summary')
        .select('positive_confirmations, negative_reports, unique_contributors')
        .eq('source_part_id', sourcePartId);
      if (error) throw error;
      const totals = (data || []).reduce((acc, row) => ({
        positive: acc.positive + Number(row.positive_confirmations || 0),
        negative: acc.negative + Number(row.negative_reports || 0),
        contributors: acc.contributors + Number(row.unique_contributors || 0)
      }), { positive: 0, negative: 0, contributors: 0 });
      setSummary(totals);
    } catch {
      setSummary({ positive: 0, negative: 0, contributors: 0 });
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => { loadSummary(); }, [sourcePartId]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setMessage('');
    try {
      const normalizedTarget = targetPartNumber.trim().toUpperCase();
      const { error } = await supabase
        .from('compatibility_confirmations')
        .upsert({
          source_part_id: sourcePartId,
          target_part_number: normalizedTarget,
          contributor_user_id: user.id,
          outcome,
          experience_type: experienceType,
          note: note.trim() || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'source_part_id,target_part_number,contributor_user_id' });
      if (error) throw error;
      setMessage(t.communitySaved);
      setTargetPartNumber('');
      setNote('');
      await loadSummary();
    } catch {
      setMessage(t.communitySaveError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ip-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[#47bcb6]/10 p-2 text-[#47bcb6]"><Users className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white">{t.communityCompatibility}</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/45">{t.communityDescription}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="text-lg font-semibold text-[#47bcb6]">{loadingSummary ? '—' : summary.positive}</div><div className="text-[9px] uppercase tracking-wider text-white/30">{t.confirmations}</div></div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="text-lg font-semibold text-red-300">{loadingSummary ? '—' : summary.negative}</div><div className="text-[9px] uppercase tracking-wider text-white/30">{t.negativeReports}</div></div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="text-lg font-semibold text-white/80">{loadingSummary ? '—' : summary.contributors}</div><div className="text-[9px] uppercase tracking-wider text-white/30">{t.uniqueUsers}</div></div>
      </div>

      {!isAuthenticated ? (
        <div className="mt-4 rounded-lg border border-[#5a9cd9]/20 bg-[#5a9cd9]/[0.05] p-3">
          <div className="text-xs text-white/70">{t.accountRequiredCompatibility}</div>
          <Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#5a9cd9] px-3 py-2 text-xs font-semibold text-[#080d12] hover:bg-[#78b5ea]"><LogIn className="h-3.5 w-3.5" /> {t.signInToParticipate}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="text-[10px] uppercase tracking-wider text-white/35">{t.experiencedPartNumber}</span><input value={targetPartNumber} onChange={(e) => setTargetPartNumber(e.target.value)} placeholder="Ej. ABC-123" className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a0e12] px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-[#47bcb6]/60" required /></label>
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-white/35">{t.outcome}</span><select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a0e12] px-3 py-2.5 text-sm text-white outline-none"><option value="confirmed">{t.compatibleWorked}</option><option value="incompatible">{t.incompatibleFailed}</option></select></label>
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-white/35">{t.experienceType}</span><select value={experienceType} onChange={(e) => setExperienceType(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a0e12] px-3 py-2.5 text-sm text-white outline-none"><option value="field_use">{t.fieldUse}</option><option value="installation">{t.installation}</option><option value="technical_review">{t.technicalReviewType}</option></select></label>
          </div>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-white/35">{t.optionalNote}</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder={t.technicalContextPlaceholder} className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-[#0a0e12] px-3 py-2.5 text-sm text-white outline-none focus:border-[#47bcb6]/60" /></label>
          <button type="submit" disabled={!canSubmit || loading} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#47bcb6] px-4 py-2.5 text-xs font-semibold text-[#071012] hover:bg-[#62ccc6] disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : outcome === 'confirmed' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{loading ? t.registering : t.registerExperience}</button>
          {message && <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#47bcb6]" />{message}</div>}
        </form>
      )}
    </section>
  );
}