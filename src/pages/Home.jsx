import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import SiteHeader from '@/components/landing/SiteHeader';
import Hero from '@/components/landing/Hero';
import CategorySection from '@/components/landing/CategorySection';
import ForumCard from '@/components/landing/ForumCard';
import WorkflowSteps from '@/components/landing/WorkflowSteps';
import { AREAS } from '@/lib/taxonomy';

export default function Home() {
  const [partCount, setPartCount] = useState(0);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const parts = await base44.entities.Part.list('-updated_date', 1000);
        const c = {};
        AREAS.forEach((a) => { c[a.id] = 0; });
        parts.forEach((p) => {
          const area = AREAS.find((a) => a.name === p.category);
          if (area) c[area.id] = (c[area.id] || 0) + 1;
        });
        setCounts(c);
        setPartCount(parts.length);
      } catch (e) {
        // Knowledge Core vacío o no disponible: mostrar estados vacíos honestos
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0e12] grid-bg flex flex-col">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-5xl">
        <Hero partCount={partCount} loading={loading} />
        <CategorySection counts={counts} />
        <ForumCard />
        <WorkflowSteps />
      </main>
      <footer className="px-5 py-8 text-center border-t border-white/5 mt-4">
        <p className="text-white/30 text-[11px] tracking-wide">
          INDUSTRIALPEDIA · Knowledge Core industrial · Buscar · Encontrar · Comparar · Decidir
        </p>
      </footer>
    </div>
  );
}