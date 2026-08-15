import { MessageSquare, ArrowRight } from 'lucide-react';

export default function ForumCard() {
  return (
    <section className="px-5 py-6">
      <div className="bg-[#161a20] border border-white/10 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 text-[#5a9cd9]" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-semibold text-sm">Foro de la comunidad</h3>
              <span className="px-2 py-0.5 rounded bg-white/10 text-white/60 text-[10px] font-medium tracking-wide">
                PRÓXIMAMENTE
              </span>
            </div>
            <p className="text-white/50 text-xs leading-relaxed mt-1.5">
              Comparte experiencias con refacciones, resuelve dudas y valida reemplazos entre marcas con otros técnicos.
            </p>
          </div>
        </div>
        <button className="w-full flex items-center justify-center gap-2 border border-white/15 rounded-lg py-2.5 text-white text-sm font-medium hover:bg-white/5 transition-colors">
          Entrar al foro <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}