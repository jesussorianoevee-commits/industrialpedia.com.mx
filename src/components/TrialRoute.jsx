import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-5">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold">¿Deseas probar más?</h2>
          <p className="mt-3 text-sm text-muted-foreground">Regístrate :)</p>
          <button
            type="button"
            onClick={() => navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)}
            className="mt-6 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Registrarme
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return children;
}
