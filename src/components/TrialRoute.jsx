import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const TRIAL_LIMIT = 3;
const STORAGE_KEY = 'industrialpedia_trial_uses_v1';

function getTrialUses() {
  try {
    const value = Number.parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export default function TrialRoute({ children }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    if (isLoadingAuth) return;
    if (isAuthenticated) {
      setAllowed(true);
      return;
    }

    const used = getTrialUses();
    if (used >= TRIAL_LIMIT) {
      setAllowed(false);
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, String(used + 1));
    } catch {}
    setAllowed(true);
  }, [isAuthenticated, isLoadingAuth]);

  if (isLoadingAuth || allowed === null) return null;

  if (!allowed) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return children;
}
