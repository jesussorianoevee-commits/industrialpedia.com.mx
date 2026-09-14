import { lazy, Suspense, useEffect, useState } from 'react';
import SiteHeader from '@/components/landing/SiteHeader';
import Hero from '@/components/landing/Hero';

import CategorySection from '@/components/landing/CategorySection';
const UseCasesSection = lazy(() => import('@/components/landing/UseCasesSection'));
import ForumCard from '@/components/landing/ForumCard';
import WorkflowSteps from '@/components/landing/WorkflowSteps';

export default function Home() {
  // null significa que todavía no hay un total confirmado. Nunca usamos 0 como valor provisional.
  const [partCount, setPartCount] = useState(null);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refreshCount = async () => {
    // Cargamos el módulo de estadísticas después del primer render del Home.
    // Así su código no forma parte del bundle crítico de entrada.
    const { getIndustrialpediaCatalogStats, getIndustrialpediaCategoryStats } =
      await import('../../base44/shared/supabaseIndustrialpediaApi.js');

    // Ambas fuentes son independientes: iniciarlas juntas evita que la segunda
    // espere innecesariamente a la primera. Cada resultado se aplica de forma
    // independiente, preservando el último dato válido si una consulta falla.
    const results = await Promise.allSettled([
      getIndustrialpediaCatalogStats(),
      getIndustrialpediaCategoryStats(),
    ]);

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
    (async () => {
      let refreshed = false;
      for (let attempt = 0; attempt < 3 && !refreshed; attempt += 1) {
        refreshed = await refreshCount();
        if (!refreshed && attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
      setLoading(false);
    })();
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