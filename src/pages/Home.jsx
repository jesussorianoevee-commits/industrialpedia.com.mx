import { lazy, Suspense, useEffect, useState } from 'react';
import SiteHeader from '@/components/landing/SiteHeader';
import Hero from '@/components/landing/Hero';

import CategorySection from '@/components/landing/CategorySection';
const UseCasesSection = lazy(() => import('@/components/landing/UseCasesSection'));
import ForumCard from '@/components/landing/ForumCard';
import WorkflowSteps from '@/components/landing/WorkflowSteps';

const STATS_MODULE = '../../base44/shared/supabaseIndustrialpediaApi.js';
const STATS_LOAD_TIMEOUT_MS = 8000;

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

export default function Home() {
  // null significa que todavía no hay un total confirmado. Nunca usamos 0 como valor provisional.
  const [partCount, setPartCount] = useState(null);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refreshCount = async () => {
    let api;
    try {
      // Cargamos el módulo de estadísticas después del primer render del Home.
      // Si el chunk no llega, no bloqueamos la pantalla y el intento se rehará.
      api = await withTimeout(import(STATS_MODULE), STATS_LOAD_TIMEOUT_MS);
    } catch (error) {
      console.error('Industrialpedia home stats module load failed', error);
      return false;
    }

    if (!api) return false;

    const { getIndustrialpediaCatalogStats, getIndustrialpediaCategoryStats } = api;

    // Ambas fuentes son independientes: iniciarlas juntas evita que la segunda
    // espere innecesariamente a la primera. Cada resultado se aplica de forma
    // independiente, preservando el último dato válido si una consulta falla.
    const results = await withTimeout(
      Promise.allSettled([
        getIndustrialpediaCatalogStats(),
        getIndustrialpediaCategoryStats(),
      ]),
      STATS_LOAD_TIMEOUT_MS,
    );

    if (!Array.isArray(results)) return false;

    let refreshed = false;

    const catalogResult = results[0];
    if (catalogResult.status === 'fulfilled') {
      const total = Number(catalogResult.value?.count);
      if (Number.isFinite(total)) {
        setPartCount(total);
        setLastUpdated(new Date());
        refreshed = true;
      }
    }

    const categoryResult = results[1];
    if (categoryResult.status === 'fulfilled') {
      const categoryStats = categoryResult.value;
      if (categoryStats && typeof categoryStats === 'object') {
        setCounts(categoryStats);
      }
    }

    return refreshed;
  };

  useEffect(() => {
    let cancelled = false;
    let timerId = null;
    let idleId = null;

    const startRefresh = async () => {
      if (cancelled) return;
      let refreshed = false;
      for (let attempt = 0; attempt < 3 && !refreshed && !cancelled; attempt += 1) {
        refreshed = await refreshCount();
        if (!refreshed && attempt < 2 && !cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
      if (!cancelled) setLoading(false);
    };

    // Las estadísticas son secundarias. No deben competir con la primera
    // navegación del usuario ni con la carga de /buscar en una conexión móvil.
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(startRefresh, { timeout: 1800 });
    } else {
      timerId = window.setTimeout(startRefresh, 1200);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    const handleCategoryStatsUpdated = (event) => {
      if (event?.detail && typeof event.detail === 'object') {
        setCounts(event.detail);
      }
    };
    const interval = setInterval(refreshCount, 30000);
    const handleFocus = () => refreshCount();
    window.addEventListener('industrialpedia:category-stats-updated', handleCategoryStatsUpdated);
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('industrialpedia:category-stats-updated', handleCategoryStatsUpdated);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground grid-bg flex flex-col transition-colors">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-6xl">
        <Hero partCount={partCount} loading={loading} lastUpdated={lastUpdated} />
        <Suspense fallback={null}>
          <UseCasesSection />
        </Suspense>
        <CategorySection counts={counts} />
        <ForumCard />
        <WorkflowSteps />
      </main>
      <footer className="px-5 py-8 text-center border-t border-border mt-4">
        <p className="ip-muted text-[11px] tracking-wide">
          INDUSTRIALPEDIA · Knowledge Core industrial · Buscar · Encontrar · Comparar · Decidir
        </p>
      </footer>
    </div>
  );
}