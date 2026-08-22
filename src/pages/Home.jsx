import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import SiteHeader from '@/components/landing/SiteHeader';
import Hero from '@/components/landing/Hero';
import CategorySection from '@/components/landing/CategorySection';
import ForumCard from '@/components/landing/ForumCard';
import WorkflowSteps from '@/components/landing/WorkflowSteps';
import { AREAS } from '@/lib/taxonomy';
import { getIndustrialpediaCatalogStats, getIndustrialpediaCategoryStats } from '../../base44/shared/supabaseIndustrialpediaApi.js';

export default function Home() {
  const [partCount, setPartCount] = useState(0);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refreshCount = async () => {
    try {
      // Catálogo canónico: Supabase. No usamos Base44 Part ni un límite de 1000.
      const stats = await getIndustrialpediaCatalogStats();
      const total = Number(stats?.count);
      if (!Number.isFinite(total)) throw new Error('invalid_catalog_count');
      const categoryStats = await getIndustrialpediaCategoryStats();
      setCounts(categoryStats);
      setPartCount(total);
      setLastUpdated(new Date());
      return true;
    } catch (e) {
      return false;
    }
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