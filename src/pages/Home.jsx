import { useEffect, useState } from 'react';
import SiteHeader from '@/components/landing/SiteHeader';
import Hero from '@/components/landing/Hero';
import CategorySection from '@/components/landing/CategorySection';
import ForumCard from '@/components/landing/ForumCard';
import WorkflowSteps from '@/components/landing/WorkflowSteps';
import { getIndustrialpediaCatalogStats, getIndustrialpediaCategoryStats } from '../../base44/shared/supabaseIndustrialpediaApi.js';

export default function Home() {
  const [partCount, setPartCount] = useState(0);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refreshCount = async () => {
    let refreshed = false;

    // El total del catálogo y los conteos por área son fuentes independientes.
    // Si una consulta de taxonomía tarda/falla, nunca debemos convertir un catálogo
    // válido en "0 refacciones" en la UI.
    try {
      const stats = await getIndustrialpediaCatalogStats();
      const total = Number(stats?.count);
      if (Number.isFinite(total)) {
        setPartCount(total);
        setLastUpdated(new Date());
        refreshed = true;
      }
    } catch {
      // Conservamos el último total válido.
    }

    try {
      const categoryStats = await getIndustrialpediaCategoryStats();
      if (categoryStats && typeof categoryStats === 'object') {
        setCounts(categoryStats);
        refreshed = true;
      }
    } catch {
      // Conservamos los últimos conteos válidos; nunca reemplazamos datos por ceros.
    }

    return refreshed;
  };

  useEffect(() => {
    (async () => {
      try {
        await refreshCount();
      } catch (e) {
        // Knowledge Core vacío o no disponible: mostrar estados vacíos honestos
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshCount, 30000);
    const handleFocus = () => refreshCount();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground grid-bg flex flex-col transition-colors">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-6xl">
        <Hero partCount={partCount} loading={loading} lastUpdated={lastUpdated} />
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