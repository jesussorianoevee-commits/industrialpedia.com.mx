export default function CapuchinaLoader({
  fullScreen = false,
  label = "Cargando Industrialpedia"
}) {
  return (
    <>
      <div
        style={{
          position: fullScreen ? "fixed" : "relative",
          inset: fullScreen ? 0 : undefined,
          zIndex: fullScreen ? 9999 : undefined,
          width: "100%",
          minHeight: fullScreen ? "100vh" : "360px",
          background: "#080d12",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >

        <div
          style={{
            width: 260,
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div className="ip-capu-animation">

            <div className="ip-capu-tail" />

            <div className="ip-capu-body">
              <div className="ip-capu-leg ip-capu-leg-1" />
              <div className="ip-capu-leg ip-capu-leg-2" />
              <div className="ip-capu-leg ip-capu-leg-3" />
              <div className="ip-capu-leg ip-capu-leg-4" />

              <div className="ip-capu-cyber">
                IP
              </div>
            </div>

            <div className="ip-capu-head">
              <div className="ip-capu-ear ip-capu-ear-left" />
              <div className="ip-capu-ear ip-capu-ear-right" />

              <div className="ip-capu-eye ip-capu-eye-left" />
              <div className="ip-capu-eye ip-capu-eye-right" />

              <div className="ip-capu-nose" />
            </div>

            <div className="ip-capu-mask" />

            <div className="ip-capu-collar" />

          </div>
        </div>

        <div
          style={{
            color: "rgba(255,255,255,.62)",
            fontSize: 12,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            textAlign: "center"
          }}
        >
          {label}
          <span className="ip-capu-dots">...</span>
        </div>

        <div
          style={{
            width: 210,
            height: 3,
            marginTop: 14,
            overflow: "hidden",
            background: "rgba(255,255,255,.10)",
            borderRadius: 4
          }}
        >
          <div className="ip-capu-progress" />
        </div>

        <div
          style={{
            marginTop: 12,
            color: "rgba(255,255,255,.28)",
            fontSize: 10,
            letterSpacing: ".22em",
            textTransform: "uppercase"
          }}
        >
          CAPUCHINA-01 · INDUSTRIALPEDIA
        </div>

      </div>

      <style>{`

        .ip-capu-animation {
          position: relative;
          width: 150px;
          height: 100px;
          animation: ip-capu-walk .8s steps(8) infinite;
          transform-origin: center bottom;
        }

        .ip-capu-body {
          position: absolute;
          left: 28px;
          top: 40px;
          width: 82px;
          height: 38px;
          background: #ead9c9;
          border-radius: 22px;
          box-shadow:
            -4px 3px 0 #f6e9dc,
            4px 5px 0 #cbb5a8;
        }

        .ip-capu-head {
          position: absolute;
          right: 4px;
          top: 15px;
          width: 50px;
          height: 48px;
          background: #ead9c9;
          border-radius: 50%;
          box-shadow:
            -3px 2px 0 #f7ebe0,
            4px 4px 0 #c5aea3;
        }

        .ip-capu-mask {
          position: absolute;
          right: 5px;
          top: 25px;
          width: 45px;
          height: 20px;
          background: #75615b;
          border-radius: 50%;
          opacity: .9;
        }

        .ip-capu-ear {
          position: absolute;
          top: -6px;
          width: 20px;
          height: 20px;
          background: #75615b;
          transform: rotate(45deg);
        }

        .ip-capu-ear-left {
          left: 2px;
        }

        .ip-capu-ear-right {
          right: 2px;
        }

        .ip-capu-eye {
          position: absolute;
          top: 25px;
          width: 9px;
          height: 9px;
          background: #4ea8ff;
          border: 2px solid #eaf5ff;
          border-radius: 50%;
          z-index: 2;
        }

        .ip-capu-eye-left {
          left: 10px;
        }

        .ip-capu-eye-right {
          right: 10px;
        }

        .ip-capu-nose {
          position: absolute;
          left: 21px;
          top: 38px;
          width: 7px;
          height: 5px;
          background: #e58da9;
          z-index: 3;
        }

        .ip-capu-collar {
          position: absolute;
          right: 7px;
          top: 57px;
          width: 37px;
          height: 5px;
          background: #e45f91;
          z-index: 4;
        }

        .ip-capu-tail {
          position: absolute;
          left: 0;
          top: 10px;
          width: 45px;
          height: 55px;
          border-left: 13px solid #9b8279;
          border-top: 13px solid #b59c92;
          border-radius: 50%;
          transform: rotate(-15deg);
          transform-origin: bottom right;
          animation: ip-capu-tail 1.5s ease-in-out infinite;
        }

        .ip-capu-leg {
          position: absolute;
          bottom: -5px;
          width: 12px;
          height: 24px;
          background: #705852;
          border-radius: 5px;
        }

        .ip-capu-leg-1 { left: 35px; }
        .ip-capu-leg-2 { left: 56px; }
        .ip-capu-leg-3 { left: 78px; }
        .ip-capu-leg-4 { left: 94px; }

        .ip-capu-cyber {
          position: absolute;
          left: 54px;
          top: 43px;
          width: 18px;
          height: 18px;
          background: #69757e;
          border: 2px solid #adb7be;
          color: #58a8ed;
          font-size: 6px;
          font-family: monospace;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3;
          box-shadow: 3px 3px 0 #41494f;
        }

        .ip-capu-dots {
          display: inline-block;
          width: 18px;
          overflow: hidden;
          animation: ip-capu-dots 1.2s steps(4) infinite;
        }

        .ip-capu-progress {
          width: 35%;
          height: 100%;
          background: #5a9cd9;
          animation: ip-capu-progress 1.4s linear infinite;
        }

        @keyframes ip-capu-walk {
          0%,100% {
            transform: translateY(0);
          }
          12.5%,37.5%,62.5%,87.5% {
            transform: translateY(-3px);
          }
          25%,50%,75% {
            transform: translateY(0);
          }
        }

        @keyframes ip-capu-tail {
          0%,100% {
            transform: rotate(-15deg);
          }
          50% {
            transform: rotate(7deg);
          }
        }

        @keyframes ip-capu-dots {
          0% { width: 0; }
          33% { width: 6px; }
          66% { width: 12px; }
          100% { width: 18px; }
        }

        @keyframes ip-capu-progress {
          from {
            transform: translateX(-140%);
          }
          to {
            transform: translateX(400%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ip-capu-animation,
          .ip-capu-tail,
          .ip-capu-dots,
          .ip-capu-progress {
            animation: none;
          }
        }

      `}</style>
    </>
  );
}