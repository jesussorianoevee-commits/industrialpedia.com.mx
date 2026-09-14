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
  // Las estadísticas son secundarias: la pantalla no debe quedar en estado de
  // carga mientras se consulta el catálogo.
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
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

    // Cada fuente tiene su propio límite. Antes se envolvía Promise.allSettled
    // completo con un timeout: una sola llamada lenta retenía el resultado de
    // la otra y prolongaba artificialmente el estado "Cargando refacciones".
    const results = await Promise.allSettled([
      withTimeout(getIndustrialpediaCatalogStats(), STATS_LOAD_TIMEOUT_MS),
      withTimeout(getIndustrialpediaCategoryStats(), STATS_LOAD_TIMEOUT_MS),
    ]);

    let refreshed = false;

    const catalogResult = results[0];
    if (catalogResult.status === 'fulfilled' && catalogResult.value) {
      const total = Number(catalogResult.value?.count);
      if (Number.isFinite(total)) {
        setPartCount(total);
        setLastUpdated(new Date());
        refreshed = true;
      }
    }

    const categoryResult = results[1];
    if (categoryResult.status === 'fulfilled' && categoryResult.value) {
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
      // Una consulta fallida no debe convertir la Home en una pantalla de
      // espera. La siguiente revalidación periódica volverá a intentarlo.
      await refreshCount();
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
    // Revalidación de bajo impacto; 30 segundos generaba tráfico y trabajo
    // innecesario incluso cuando el usuario no hacía nada.
    const interval = setInterval(refreshCount, 5 * 60 * 1000);
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