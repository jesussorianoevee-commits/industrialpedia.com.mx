export default function IndustrialpediaLoader({ fullScreen = false, label = 'Cargando Industrialpedia…' }) {
  return (
    <div className={fullScreen ? 'fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#080d12]' : 'flex min-h-[360px] items-center justify-center overflow-hidden'}>
      <div className="flex flex-col items-center justify-center px-4">
        <div
          className="capuchina-pixel relative h-[180px] w-[200px] sm:h-[200px] sm:w-[220px]"
          aria-label="Capuchina, mascota cyborg de Industrialpedia"
        >
          <div className="pixel-cat">
            <div className="pixel-tail">
              <div className="pixel-tail-seg pixel-tail-seg-1" />
              <div className="pixel-tail-seg pixel-tail-seg-2" />
              <div className="pixel-tail-seg pixel-tail-seg-3" />
            </div>

            <div className="pixel-body">
              <div className="pixel-chest">
                <span className="pixel-bolt pixel-bolt-tl" />
                <span className="pixel-bolt pixel-bolt-tr" />
                <span className="pixel-bolt pixel-bolt-bl" />
                <span className="pixel-bolt pixel-bolt-br" />
                <span className="pixel-chest-label">IP</span>
                <span className="pixel-core" />
              </div>
              <div className="pixel-leg pixel-leg-left" />
              <div className="pixel-leg pixel-leg-right" />
              <div className="pixel-collar" />
            </div>

            <div className="pixel-head">
              <div className="pixel-ear pixel-ear-left" />
              <div className="pixel-ear pixel-ear-right">
                <span className="pixel-antenna" />
                <span className="pixel-antenna-dot" />
              </div>
              <div className="pixel-mask" />
              <div className="pixel-eye pixel-eye-left" />
              <div className="pixel-eye pixel-eye-right" />
              <div className="pixel-nose" />
              <div className="pixel-mouth" />
            </div>

            <span className="pixel-deco" />
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-center text-[11px] uppercase tracking-[0.16em] text-white/50 sm:text-xs">
            <span>{label}</span>
            <span className="inline-flex gap-0.5" aria-hidden="true"><span className="capu-dot d1">.</span><span className="capu-dot d2">.</span><span className="capu-dot d3">.</span></span>
          </div>
          <div className="h-px w-40 max-w-[60vw] overflow-hidden bg-white/10"><div className="capu-progress h-full w-1/3 bg-[#5a9cd9]" /></div>
        </div>

        <style>{`
          .capuchina-pixel {
            --cream: #e9dcc7;
            --cream-lo: #cdb99e;
            --point: #6a564c;
            --point-lo: #4a3a34;
            --metal: #8b95a0;
            --metal-lo: #4c5359;
            --cyber: #58b4ff;
            --cyber-bright: #b6e3ff;
            --collar: #e45f91;
            image-rendering: pixelated;
          }

          .pixel-cat, .pixel-cat * {
            position: absolute;
            border-radius: 0;
            box-sizing: border-box;
          }

          .pixel-cat {
            width: 100%;
            height: 100%;
            transform-origin: center bottom;
            animation: pc-idle 2.2s steps(2) infinite;
          }

          .pixel-tail {
            left: 0;
            top: 44px;
            width: 40px;
            height: 84px;
            transform-origin: right bottom;
            animation: pc-tail-sway 2.2s ease-in-out infinite;
          }
          .pixel-tail-seg { background: var(--cream); box-shadow: 3px 3px 0 var(--cream-lo), 3px 3px 0 1px #000; }
          .pixel-tail-seg-1 { left: 14px; top: 44px; width: 20px; height: 20px; }
          .pixel-tail-seg-2 { left: 4px; top: 22px; width: 22px; height: 22px; }
          .pixel-tail-seg-3 { left: 0; top: 2px; width: 20px; height: 20px; }

          .pixel-body {
            left: 30px;
            top: 92px;
            width: 86px;
            height: 50px;
            background: var(--cream);
            box-shadow: 3px 3px 0 var(--cream-lo), 3px 3px 0 1px #000;
          }

          .pixel-chest {
            left: 14px;
            top: 6px;
            width: 46px;
            height: 36px;
            background: var(--metal-lo);
            box-shadow: 2px 2px 0 #000;
          }
          .pixel-bolt { width: 6px; height: 6px; background: var(--metal); box-shadow: 1px 1px 0 #000; }
          .pixel-bolt-tl { left: 2px; top: 2px; }
          .pixel-bolt-tr { right: 2px; top: 2px; }
          .pixel-bolt-bl { left: 2px; bottom: 2px; }
          .pixel-bolt-br { right: 2px; bottom: 2px; }
          .pixel-chest-label {
            left: 12px;
            top: 10px;
            width: 22px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font: 700 10px/1 monospace;
            color: var(--cyber-bright);
            background: #38414a;
            box-shadow: 1px 1px 0 #000;
          }
          .pixel-core {
            right: 3px;
            bottom: 3px;
            width: 6px;
            height: 6px;
            background: var(--cyber);
            box-shadow: 0 0 0 1px #000, 0 0 6px 2px var(--cyber);
            animation: pc-core-pulse 1.6s ease-in-out infinite;
          }

          .pixel-leg {
            bottom: -20px;
            width: 16px;
            height: 22px;
            background: var(--metal-lo);
            box-shadow: 2px 2px 0 #000, inset 0 6px 0 0 var(--metal);
          }
          .pixel-leg-left { left: 16px; transform: rotate(-6deg); }
          .pixel-leg-right { left: 56px; bottom: -24px; height: 26px; transform: rotate(5deg); }

          .pixel-collar {
            left: 66px;
            top: -4px;
            width: 26px;
            height: 6px;
            background: var(--collar);
            box-shadow: 1px 1px 0 #000;
          }

          .pixel-head {
            left: 78px;
            top: 26px;
            width: 76px;
            height: 70px;
            background: var(--cream);
            box-shadow: 3px 3px 0 var(--cream-lo), 3px 3px 0 1px #000;
          }

          .pixel-ear {
            top: -14px;
            width: 20px;
            height: 20px;
            background: var(--point);
            box-shadow: 2px 2px 0 var(--point-lo), 2px 2px 0 1px #000;
          }
          .pixel-ear-left { left: 8px; }
          .pixel-ear-right { left: 48px; }
          .pixel-antenna { left: 8px; top: -10px; width: 3px; height: 12px; background: var(--metal); }
          .pixel-antenna-dot {
            left: 5px;
            top: -15px;
            width: 7px;
            height: 7px;
            background: var(--cyber);
            box-shadow: 0 0 0 1px #000, 0 0 6px 2px var(--cyber);
            animation: pc-eye-glow 2.2s ease-in-out infinite;
          }

          .pixel-mask {
            left: 12px;
            top: 30px;
            width: 52px;
            height: 30px;
            background: var(--point);
            opacity: .85;
          }

          .pixel-eye {
            top: 32px;
            width: 14px;
            height: 14px;
            background: var(--cyber);
            box-shadow: 0 0 0 2px #04121c, 0 0 8px 2px var(--cyber);
            animation: pc-eye-glow 2.2s ease-in-out infinite;
          }
          .pixel-eye-left { left: 18px; }
          .pixel-eye-right { left: 44px; }

          .pixel-nose { left: 35px; top: 50px; width: 6px; height: 5px; background: #e58da9; }
          .pixel-mouth { left: 30px; top: 57px; width: 16px; height: 2px; background: var(--point-lo); opacity: .6; }

          .pixel-deco {
            left: 150px;
            top: 30px;
            width: 8px;
            height: 8px;
            background: var(--cyber);
            box-shadow: 0 0 0 1px #000, 0 0 6px 1px var(--cyber);
            animation: pc-deco-float 2.6s ease-in-out infinite;
          }

          .capu-dot { position: static; animation: capu-dot 1.1s ease-in-out infinite; }
          .capu-dot.d1 { animation-delay: -0.22s; }
          .capu-dot.d2 { animation-delay: -0.11s; }
          .capu-progress { animation: capu-progress 1.5s ease-in-out infinite; }
          @keyframes capu-dot { 0%,80%,100% { opacity:.25; transform:translateY(0); } 40% { opacity:1; transform:translateY(-2px); } }
          @keyframes capu-progress { 0% { transform:translateX(-140%); } 50% { transform:translateX(120%); } 100% { transform:translateX(320%); } }

          @keyframes pc-idle {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
          @keyframes pc-tail-sway {
            0%, 100% { transform: rotate(-6deg); }
            50% { transform: rotate(8deg); }
          }
          @keyframes pc-eye-glow {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
          }
          @keyframes pc-core-pulse {
            0%, 100% { box-shadow: 0 0 0 1px #000, 0 0 6px 2px var(--cyber); }
            50% { box-shadow: 0 0 0 1px #000, 0 0 10px 3px var(--cyber-bright); }
          }
          @keyframes pc-deco-float {
            0%, 100% { transform: translateY(0); opacity: .9; }
            50% { transform: translateY(-6px); opacity: .4; }
          }

          @media (prefers-reduced-motion: reduce) {
            .pixel-cat, .pixel-tail, .pixel-eye, .pixel-antenna-dot, .pixel-core, .pixel-deco, .capu-dot, .capu-progress {
              animation: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
