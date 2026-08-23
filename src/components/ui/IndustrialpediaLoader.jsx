// Fallback mascot remains available if the video asset cannot be loaded.
const CAT_IMAGE = 'data:image/webp;base64,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';

export default function IndustrialpediaLoader({ fullScreen = false, label = 'Cargando Industrialpedia…' }) {
  return (
    <div className={fullScreen ? 'fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#080d12]' : 'flex min-h-[360px] items-center justify-center overflow-hidden'}>
      <div className="relative flex h-full w-full flex-col items-center justify-center px-4">
        <div className="loader-scene relative h-64 w-64 sm:h-72 sm:w-72" aria-label="Industrialpedia cargando">
          {/* Base estable: evita deformar al personaje completo. */}
          <img src={CAT_IMAGE} alt="" aria-hidden="true" className="loader-base absolute inset-0 h-full w-full select-none object-contain" draggable="false" />

          {/* Capas recortadas: engrane y extremidades se mueven por separado. */}
          <img src={CAT_IMAGE} alt="" aria-hidden="true" className="loader-gear absolute inset-0 h-full w-full select-none object-contain" draggable="false" />
          <img src={CAT_IMAGE} alt="" aria-hidden="true" className="loader-arm absolute inset-0 h-full w-full select-none object-contain" draggable="false" />
          <img src={CAT_IMAGE} alt="" aria-hidden="true" className="loader-paw absolute inset-0 h-full w-full select-none object-contain" draggable="false" />
          <img src={CAT_IMAGE} alt="" aria-hidden="true" className="loader-tail absolute inset-0 h-full w-full select-none object-contain" draggable="false" />
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-center text-[11px] uppercase tracking-[0.16em] text-white/50 sm:text-xs">
            <span>{label}</span>
            <span className="inline-flex gap-0.5" aria-hidden="true">
              <span className="loader-dot loader-dot-1">.</span><span className="loader-dot loader-dot-2">.</span><span className="loader-dot loader-dot-3">.</span>
            </span>
          </div>
          <div className="h-px w-40 max-w-[60vw] overflow-hidden bg-white/10"><div className="h-full w-1/3 bg-[#5a9cd9] loader-progress" /></div>
        </div>

        <style>{`
          .loader-scene { filter: drop-shadow(0 14px 22px rgba(0,0,0,.28)); }
          .loader-base { animation: loader-body 1.55s ease-in-out infinite; }
          .loader-gear { clip-path: circle(25% at 27% 70%); transform-origin: 27% 70%; animation: loader-gear 1.35s linear infinite; }
          .loader-arm { clip-path: polygon(38% 51%, 69% 51%, 69% 82%, 42% 82%); transform-origin: 49% 60%; animation: loader-arm 1.1s ease-in-out infinite; }
          .loader-paw { clip-path: ellipse(17% 11% at 63% 82%); transform-origin: 63% 78%; animation: loader-paw 1.1s ease-in-out infinite; }
          .loader-tail { clip-path: polygon(70% 40%, 100% 40%, 100% 95%, 70% 95%); transform-origin: 76% 78%; animation: loader-tail 1.7s ease-in-out infinite; }
          .loader-dot { animation: loader-dot 1.15s ease-in-out infinite; }
          .loader-dot-1 { animation-delay: -0.24s; }.loader-dot-2 { animation-delay: -0.12s; }
          .loader-progress { animation: loader-progress 1.5s ease-in-out infinite; }
          @keyframes loader-body { 0%,100% { transform: translate3d(0,0,0) rotate(0deg); } 50% { transform: translate3d(0,-5px,0) rotate(-1deg); } }
          @keyframes loader-gear { to { transform: rotate(360deg); } }
          @keyframes loader-arm { 0%,100% { transform: rotate(-2deg) translateY(0); } 50% { transform: rotate(7deg) translateY(-3px); } }
          @keyframes loader-paw { 0%,100% { transform: rotate(0deg) translateY(0); } 50% { transform: rotate(8deg) translateY(-4px); } }
          @keyframes loader-tail { 0%,100% { transform: rotate(-2deg); } 50% { transform: rotate(7deg); } }
          @keyframes loader-dot { 0%,80%,100% { opacity:.28; transform:translateY(0); } 40% { opacity:1; transform:translateY(-2px); } }
          @keyframes loader-progress { 0% { transform:translateX(-140%); } 50% { transform:translateX(120%); } 100% { transform:translateX(320%); } }
          @media (prefers-reduced-motion: reduce) { .loader-base,.loader-gear,.loader-arm,.loader-paw,.loader-tail,.loader-dot,.loader-progress { animation:none !important; } }
        `}</style>
      </div>
    </div>
  );
}
