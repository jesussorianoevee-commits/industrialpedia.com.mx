const STEPS = [
  { n: '01', title: 'Buscar', body: 'Encuentra información por número de parte, fabricante o descripción.' },
  { n: '02', title: 'Encontrar', body: 'Identifica alternativas relevantes sin saturarte de resultados.' },
  { n: '03', title: 'Comparar', body: 'Contrasta las especificaciones técnicas que realmente importan.' },
  { n: '04', title: 'Decidir', body: 'Llega a una decisión con información técnica clara y trazable.' }
];

export default function WorkflowSteps() {
  return (
    <section className="px-5 py-10 md:py-14">
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#5a9cd9] mb-2">El flujo Industrialpedia</p>
          <h2 className="text-white font-bold text-xl md:text-2xl">De la búsqueda a la decisión.</h2>
        </div>
      </div>
      <div className="grid md:grid-cols-4 border border-white/10 rounded-2xl overflow-hidden">
        {STEPS.map((s, i) => (
          <div key={s.n} className="relative bg-[#11161c]/80 p-5 md:p-6 border-b md:border-b-0 md:border-r border-white/10 last:border-0 min-h-[170px]">
            <span className="text-[#5a9cd9] font-mono text-xs font-semibold">{s.n}</span>
            <h3 className="text-white font-semibold text-base mt-7">{s.title}</h3>
            <p className="text-white/45 text-xs leading-relaxed mt-2 max-w-xs">{s.body}</p>
            {i < STEPS.length - 1 && <span className="hidden md:block absolute right-4 bottom-5 text-white/10">→</span>}
          </div>
        ))}
      </div>
    </section>
  );
}