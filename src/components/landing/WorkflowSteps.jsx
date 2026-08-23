import { useLanguage } from '@/lib/i18n';

export default function WorkflowSteps() {
  const { t } = useLanguage();
  const STEPS = [
    { n: '01', title: t.search, body: t.workflowSearch },
    { n: '02', title: t.findAlternatives, body: t.workflowFind },
    { n: '03', title: t.compare, body: t.workflowCompare },
    { n: '04', title: t.decide, body: t.workflowDecide }
  ];
  return (
    <section className="px-3 sm:px-5 py-10 md:py-16 max-w-5xl mx-auto w-full">
      <div className="rounded-[24px] border border-border/70 bg-secondary/[0.18] px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8 text-center md:text-left"><p className="text-[10px] uppercase tracking-[0.2em] ip-accent mb-2.5">{t.workflowLabel}</p><h2 className="ip-text font-bold text-2xl md:text-3xl tracking-[-0.03em]">{t.workflowTitle}</h2></div>
      <div className="grid md:grid-cols-4 border border-border/80 rounded-2xl overflow-hidden shadow-[0_18px_45px_-38px_rgba(0,0,0,.6)]">
        {STEPS.map((s, i) => (
          <div key={s.n} className="ip-surface relative p-5 sm:p-6 md:p-7 border-b md:border-b-0 md:border-r border-border/80 last:border-0 min-h-[178px] transition-colors hover:bg-primary/[0.025]">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <span className="ip-accent font-mono text-xs font-semibold">{s.n}</span>
            </div>
            <h3 className="ip-text font-semibold text-base mt-6">{s.title}</h3>
            <p className="ip-muted text-xs leading-relaxed mt-2.5 max-w-xs">{s.body}</p>
            {i < STEPS.length - 1 && <span className="hidden md:flex absolute right-4 top-5 w-7 h-7 rounded-full border border-border items-center justify-center ip-muted opacity-50">→</span>}
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}