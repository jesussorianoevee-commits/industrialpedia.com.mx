import React from 'react';
import { Search, Crosshair, GitCompareArrows, Scale, Factory } from 'lucide-react';

const pillars = [
  { icon: Search, label: 'Buscar' },
  { icon: Crosshair, label: 'Encontrar' },
  { icon: GitCompareArrows, label: 'Comparar' },
  { icon: Scale, label: 'Decidir' },
];

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen bg-[#07111f] text-white lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden border-r border-white/10 bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,.24),transparent_32%),linear-gradient(145deg,#07111f,#0b1c31_60%,#06101d)] p-10 lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="relative flex items-center gap-3 text-xl font-bold tracking-tight">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-blue-300/30 bg-blue-500/15 text-blue-300"><Factory className="h-6 w-6" /></span>
          INDUSTRIALPEDIA
        </div>
        <div className="relative my-auto max-w-xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[.22em] text-blue-300">Inteligencia industrial</p>
          <h1 className="text-5xl font-bold leading-tight">La información técnica, donde la necesitas.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">Encuentra información industrial, compara alternativas y toma decisiones con una plataforma diseñada para el trabajo técnico.</p>
          <div className="mt-10 grid grid-cols-2 gap-3">
            {pillars.map(({ icon: Icon, label }) => <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4 py-4 backdrop-blur"><Icon className="h-5 w-5 text-blue-300" /><span className="font-medium">{label}</span></div>)}
          </div>
        </div>
        <p className="relative text-sm text-slate-500">Industrialpedia · Conocimiento técnico industrial</p>
      </section>

      <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-blue-600"><Factory className="h-6 w-6" /></div>
            <div className="font-bold tracking-tight">INDUSTRIALPEDIA</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[.055] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
            <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
            {subtitle && <p className="mt-2 text-slate-400">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
          {footer && <p className="mt-6 text-center text-sm text-slate-400">{footer}</p>}
          <p className="mt-8 text-center text-xs text-slate-600">© 2026 Industrialpedia · Términos · Privacidad · Soporte</p>
        </div>
      </main>
    </div>
  );
}
