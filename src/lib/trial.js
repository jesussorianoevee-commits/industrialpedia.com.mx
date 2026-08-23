export const TRIAL_LIMIT = 3;
const STORAGE_KEY = 'industrialpedia_trial_actions_v2';

export function getTrialUses() {
  try {
    const value = Number.parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function getTrialRemaining() {
  return Math.max(0, TRIAL_LIMIT - getTrialUses());
}

export function consumeTrialAction() {
  const used = getTrialUses();
  if (used >= TRIAL_LIMIT) return { allowed: false, used, remaining: 0 };
  const next = used + 1;
  try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
  return { allowed: true, used: next, remaining: Math.max(0, TRIAL_LIMIT - next) };
}
