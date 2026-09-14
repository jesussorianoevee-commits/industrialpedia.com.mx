import React from "react";

export default function CapuchinaLoader({
  fullScreen = false,
  label = "Cargando Industrialpedia"
}) {
  return (
    <div
      className={
        fullScreen
          ? "fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#080d12]"
          : "flex min-h-[360px] items-center justify-center overflow-hidden bg-[#080d12]"
      }
    >
      <div className="flex flex-col items-center justify-center px-4">

        {/* CAPUCHINA */}
        <div
          className="capuchina"
          aria-label="Capuchina, mascota de Industrialpedia"
        >
          <div className="cat-body">
            <div className="ear left-ear" />
            <div className="ear right-ear" />

            <div className="head">
              <div className="eye left-eye" />
              <div className="eye right-eye" />
              <div className="nose" />
            </div>

            <div className="body" />
            <div className="leg leg1" />
            <div className="leg leg2" />
            <div className="leg leg3" />
            <div className="leg leg4" />

            {/* Detalle industrial */}
            <div className="cyber-piece" />

            <div className="tail">
              <div className="tail-light" />
            </div>

            {/* Collar */}
            <div className="collar" />
          </div>
        </div>

        {/* TEXTO */}
        <div className="mt-8 flex flex-col items-center gap-3">

          <div className="text-center text-xs uppercase tracking-[0.18em] text-white/60">
            {label}
            <span className="loading-dots">...</span>
          </div>

          <div className="h-1 w-52 overflow-hidden rounded-full bg-white/10">
            <div className="loading-bar" />
          </div>

          <div className="text-[10px] uppercase tracking-[0.22em] text-white/30">
            CAPUCHINA-01 · INDUSTRIALPEDIA
          </div>

        </div>

        <style>{`

          /* =====================================================
             CONTENEDOR
          ===================================================== */

          .capuchina {
            position: relative;
            width: 220px;
            height: 170px;
            display: flex;
            align-items: center;
            justify-content: center;
            image-rendering: pixelated;
          }

          .cat-body {
            position: relative;
            width: 120px;
            height: 80px;
            animation: walk .8s steps(8) infinite;
            transform-origin: center bottom;
          }

          /* =====================================================
             CUERPO
          ===================================================== */

          .body {
            position: absolute;
            left: 20px;
            top: 28px;
            width: 72px;
            height: 38px;
            background: #ead7c7;

            box-shadow:
              4px 4px 0 #d6bfb0,
              -4px 4px 0 #f4e6da;

            border-radius: 18px;
          }

          /* =====================================================
             CABEZA
          ===================================================== */

          .head {
            position: absolute;
            right: 4px;
            top: 6px;
            width: 48px;
            height: 46px;

            background: #ead7c7;

            box-shadow:
              4px 4px 0 #c4aaa0,
              -4px 4px 0 #f6e9dd;

            border-radius: 45% 45% 42% 42%;
          }

          /* =====================================================
             OREJAS
          ===================================================== */

          .ear {
            position: absolute;
            top: 0;
            width: 18px;
            height: 18px;
            background: #75605b;
            transform: rotate(45deg);
          }

          .left-ear {
            left: 2px;
          }

          .right-ear {
            right: 2px;
          }

          /* =====================================================
             OJOS AZULES
          ===================================================== */

          .eye {
            position: absolute;
            top: 19px;
            width: 9px;
            height: 9px;
            background: #4ea6ff;

            box-shadow:
              2px 2px 0 #bfe3ff;

            border-radius: 50%;
          }

          .left-eye {
            left: 9px;
          }

          .right-eye {
            right: 9px;
          }

          /* =====================================================
             NARIZ
          ===================================================== */

          .nose {
            position: absolute;
            left: 20px;
            top: 31px;
            width: 7px;
            height: 5px;
            background: #e58ca7;
          }

          /* =====================================================
             PATAS
          ===================================================== */

          .leg {
            position: absolute;
            bottom: 3px;
            width: 12px;
            height: 25px;
            background: #705953;

            box-shadow:
              2px 3px 0 #554440;
          }

          .leg1 {
            left: 22px;
          }

          .leg2 {
            left: 45px;
          }

          .leg3 {
            left: 67px;
          }

          .leg4 {
            left: 85px;
          }

          /* =====================================================
             COLA
          ===================================================== */

          .tail {
            position: absolute;
            left: -5px;
            top: 5px;
            width: 34px;
            height: 48px;

            border-left: 12px solid #9b8279;
            border-top: 12px solid #b49b91;

            border-radius: 50%;
            transform: rotate(-18deg);
            transform-origin: bottom right;

            animation: tailMove 1.6s ease-in-out infinite;
          }

          .tail-light {
            position: absolute;
            width: 6px;
            height: 6px;
            background: #63aef4;
            left: -9px;
            top: 13px;

            box-shadow:
              8px 3px 0 #63aef4;
          }

          /* =====================================================
             COLLAR ROSA
          ===================================================== */

          .collar {
            position: absolute;
            right: 5px;
            top: 43px;

            width: 37px;
            height: 6px;

            background: #e45f91;
          }

          .collar::after {
            content: "";
            position: absolute;

            width: 7px;
            height: 7px;

            left: 15px;
            top: 5px;

            background: #f4a0bd;
          }

          /* =====================================================
             PIEZA INDUSTRIAL
          ===================================================== */

          .cyber-piece {
            position: absolute;
            left: 48px;
            top: 27px;

            width: 17px;
            height: 17px;

            background: #6d7881;

            border: 3px solid #aeb7be;

            box-shadow:
              4px 4px 0 #3f474d;

            animation: cyberPulse 1.5s ease-in-out infinite;
          }

          .cyber-piece::after {
            content: "";

            position: absolute;

            width: 5px;
            height: 5px;

            left: 3px;
            top: 3px;

            background: #5aa5e8;
          }

          /* =====================================================
             ANIMACIÓN TIPO SPRITE
          ===================================================== */

          @keyframes walk {

            0% {
              transform: translateX(0) translateY(0);
            }

            12.5% {
              transform: translateX(1px) translateY(-2px);
            }

            25% {
              transform: translateX(2px) translateY(0);
            }

            37.5% {
              transform: translateX(1px) translateY(-2px);
            }

            50% {
              transform: translateX(0) translateY(0);
            }

            62.5% {
              transform: translateX(-1px) translateY(-2px);
            }

            75% {
              transform: translateX(-2px) translateY(0);
            }

            87.5% {
              transform: translateX(-1px) translateY(-2px);
            }

            100% {
              transform: translateX(0) translateY(0);
            }

          }

          /* =====================================================
             COLA
          ===================================================== */

          @keyframes tailMove {

            0%,
            100% {
              transform: rotate(-18deg);
            }

            50% {
              transform: rotate(5deg);
            }

          }

          /* =====================================================
             PIEZA CIBOR
          ===================================================== */

          @keyframes cyberPulse {

            0%,
            100% {
              opacity: 0.7;
            }

            50% {
              opacity: 1;
            }

          }

          /* =====================================================
             PUNTOS DE CARGA
          ===================================================== */

          .loading-dots {
            display: inline-block;
            width: 18px;
            overflow: hidden;

            animation: dots 1.2s steps(4) infinite;
          }

          @keyframes dots {

            0% {
              width: 0;
            }

            33% {
              width: 6px;
            }

            66% {
              width: 12px;
            }

            100% {
              width: 18px;
            }

          }

          /* =====================================================
             BARRA
          ===================================================== */

          .loading-bar {
            width: 35%;
            height: 100%;
            background: #5a9cd9;

            animation: progress 1.5s ease-in-out infinite;
          }

          @keyframes progress {

            0% {
              transform: translateX(-120%);
            }

            100% {
              transform: translateX(400%);
            }

          }

          /* =====================================================
             REDUCIR MOVIMIENTO
          ===================================================== */

          @media (prefers-reduced-motion: reduce) {

            .cat-body,
            .tail,
            .cyber-piece,
            .loading-dots,
            .loading-bar {
              animation: none;
            }

          }

        `}</style>
      </div>
    </div>
  );
}