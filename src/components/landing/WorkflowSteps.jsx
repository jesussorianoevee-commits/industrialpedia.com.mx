const STEPS = [
  { n: '01', title: 'Busca', body: 'Escribe número de parte, marca o medida y obtén resultados con imagen.' },
  { n: '02', title: 'Compara', body: 'Ve posibles reemplazos entre fabricantes con score de confianza.' },
  { n: '03', title: 'Decide', body: 'Matriz lado a lado con las especificaciones que importan.' }
];

export default function WorkflowSteps() {
  return (
    <section className="px-5 py-6">
      <div className="space-y-3">
        {STEPS.map((s) => (
          <div key={s.n} className="bg-[#161a20]/60 border border-white/10 rounded-xl p-4">
            <div className="flex items-baseline gap-3">
              <span className="text-[#5a9cd9] font-mono text-sm font-semibold">{s.n}</span>
              <div>
                <h3 className="text-white font-semibold text-sm">{s.title}</h3>
                <p className="text-white/50 text-xs leading-relaxed mt-1">{s.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}