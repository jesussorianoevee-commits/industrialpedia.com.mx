const CAPU_IMAGE = 'data:image/webp;base64,UklGRqwNAABXRUJQVlA4IKANAAAwSgCdASq4ALAAPrlQoUunJKMirDYbsOAXCWkA05atkl7y52Q/63wn8jXx7Pux19nOpZ8w/L2PLkv8o9Qv25vH4B93bULTrf+95z/zg5L+mkw3QS2pRDMHcX7ZDgmLvxVhZj+r5SNy3lkowZFvoKw26vaQylRrk5hc7m7uxR3vj04zrowHq5H2NChfu8AGGaxU4drPl0M1iy/q4MrXySeW5orHEdN7PGU4JbCw+f1v7Le7d8le1/oIZUPirpI3Su9Olx5/oOIpLMFisqx1yNqAvnrMQJFfgIE4RfHqbo3k4FYVmWxoPldAajK0LRHLIRQSRhtEDGDOwUIC5CBV/FLJA5qNscNHUSFz7u55+lBg/JlCTAIrLVCmSp44rFXsHt39gjs6v1VfWQzFw+DNiQjsyKEdU0eFFQ8wWsmAvbmLuAugEYQeFaU93vHHAw2qXSKtlDRr61rPpZT2T7yiYJEifxMxh755fZkCGn4MbMSnaqLRXqxCJDJsZw3Tr0Q3fMXX+XwuSk+IKV2dozOtO2XNcQOkrL0LYCUmeujuGetikasiUWRZfNMaLfjDhjgsJBulRAcrOi9btz1wrlfhjiQg3+DJpumATLaN5UgyyIufeDarkQKXoohhEVHkM0qcyFp78cVVLLUFQ8oAv2AtAkRczMlNF39M221Z+0xrCOHhVjcPIpTw/XorHjDC39W4R5otXTtzIOBdCMx3JqERRgA+6WCiVl5ijBrbcaB2N8IcqZzWasLwd1FITkLImD2syLCJ9XOW82YyQ8v6+nRuKHbWThTUk9r7+ljsAAD++R2vd46erO2sz1bT0OwpNt7Jp1rbV/DYY8h1X2NwpF3PzerLSyqVHStCkzb4UeJrcUB1SrYaL+Ex6hnreCOkEU/KpPNCOnvUo3Taet37EA2lZFa1XKnw7E4UIJUxxG0g845fPIgH1ba9NHZ4+FlNjkBfimA9fjwcrDN0QDRVN59GxnD3jwJV1QyvnKIHXQ6cHl6xbuyO/ze0TPPFVFfHJrz3uWslpu3iYRogAEFtvG7rgFyoaIkRalgCX7OTMvgEjypx29NMLARZfyTvs1Hvr8EjjOkHPXP5jhybilHpawMOUGJ4J1q6viUOuODzo/puA9DQxva7u66lUAZmegmRFBTtth/0zRsAanlEk7V7SHqwAl9x8G6v0ou45IVQDWq8LYv9Aog8kSpPny/99+DxqvxozIMzCmIvfon13givGVBh37PPvcdymrZrAwadf94FZiAlQCbnCe4bT2akGneFi5Lp5ObavHbY8wH879eLBPOton2236S1g13I42K6oLDesWDK6akj7A+7UkTe0ToqDaNPRwDeUcWQO+OQJt2wiF8imkrArgFJ9HsOOKUETIedleOV4FoOluTTAhIrgSi2ETj7psUIQuYd9VsEvkE2ZUcqE+yZZkduSL1Fh0xvp7GMMU+jJbkT21lQpp/AKbiywoMXC9nEd5lQIwRHuByG2HY9OmEa2ItkYfZ+TrH38ubZ4bcX3zbhAKDzTYhw3MDmVzu94p1h/1nUav4Ey6mD1WTwv55O0R1pygkIYt2ULsPRJ8KftOlAm8JPqqNP4Z5IK0F5Md2WV26V5CETNLJecLihkbDPjpneuC/IltJm4hPUSi4vaSeNezrmuCNZ+HKi3JKc3Ts0Dp7D/Lk5S2u/vq2Q6EZ4FCY2bGAO0tDuwprGun84cJxQll4u5QOjnxCIu+A+1Rq0tFNu8PdoHFgKQbHjioXw7FU7I8usc3/PMmu1Dascp8GPfhtC2lGzRJ/6/w1V9anetrvG4akUYq9lTI8biKPOAu7xho7uaaXZvMYxrX96Ma3yvS4L4L5Y6nV7EohCcVvd48+o9cDakYUFIOEIma0D57FoHiSDYdi0YRKQulzO4a2/T1RRG7fZ/5cfW7EmCJJn1L1QveQ03BrBtTbLuxZmpaTR1Qy0lKgQJb6Rh8xkr9pMCe7Igt68NeTBa6I/id7tNHEO0Iw+NEXX6bgBUmYBszHKQNIgBrjGgSYb06/7yanyWQGdsO4WxBKn/1e+xrDFQSE79YGtmKJ1hzpXe7BST1YwtMeAXKGGRxxgC9Pz7bI/o1V/G+lGJ6zhdZq7tShOIUdhzWvuNcsimrloNGytu3UI1IWTW6q3hCd3MeEcPDCTTo71pVZM3KgQUJzE5an2jpWYcx0N9jKShJvpFYM3uU+dcFPZVZpE16DJ6CBYP+ElIVoAUzBmKmQMd3zVoYNPyDxBHReRjbl0K4zPEfqiyYn/mVPiwOEg1PtrfQ9PSxq7a3WrQW9ef/vQSVGvKX7j/xMxnBedpy5Gd6EsgrcWfIYuT3PuayodBfBA2Mk0wSqFNw8Psfzf5KnSapbEnUchcVd9EoqoiK/s9L2BiwyBQORJAkeve8wSD8nhlWWDAp3DW9OPc5hGq/E2SzxiRwovd7bemvsLAMn8a1BPpPeSdWI8JY5YEgAng5i2QjlFRUFMuzRXyuqiRumkybuDChjk9xby0VrbL4VtraFVP9iDeIjMOkQqTBeWxG7ylV7PBQkzh39uzFArUhnnZiRHh7kYtqtdeOMmfgQAy7e7JENdvpbbIp29cqqirDq1k3d4qo4RnWU2RPz/qbr6gCP7x3lDTHQtlWaGJEZyEeZ292PUZjaXu/+R0B4K1qv59npVSO3f1SxEBLwk7tKbk3Wh3WYgcq/dFzHFVfiCjlPUlm3LU/hXUEgAoVDXdxDFCdUyAWHTS9DAjrINgc2/l/hTSWTbaCX9YB56AqWF4RnSIBEwgdrRsNardeZntFnkugTqgUdavRaqnmRnxpg/5j+v89jfFDF0XnszTQR4C5A3lNRKhgyVufZaIZIs4buIO02sX7CHoExkvKlBLQx4wDsAIRh3LCazL6VuMA/56ZuOxKrU1lQedL0k8Undn87rgGSeid8jKGh/mOFJuzWOWDdUaENeyktYkaQWmzOjuz5P6zECxoh7Rmy4Hk5K0Eb++3JtAHSuMwRxCz2mYVclo6jYqyPM1drHpWdgUc9yel1QRDRiinjeNyExrIOtSQaBqaSrkA/9DFGfizA8esroNULMGoIWpxQ34vJNlYvHWr3VzcB+/ZryYvQ//5q/oyfw2CX/FLNsJkgWwLm+nM9MMyppds4qdCZ4G6XVS7NLh7snLEpz6CPPbt+wJ9+LxPZAXBb8ZYMH1lxENKfDO6pd1JJrV2XNXP0MdvusSYHyuhH731cw+zPgkqmnH6nZGvexMrAcSI8IyCfWZ3qfesb5359snUJ1rj6yDK7feYACbGthQdtvh0vrD6td7C9Jo1GfWL8i0uNaCCJwmnNWMN9kTSnbTtSYf4mqWkLW3vO0Ch0+klbf38OPS6gIX47BLyCI7Sk9kl9shVUKF7WQmJYUr+S/pozMXrtirQFOYdH2wgxFUg4mGTjdIMnA7htyN2p6n7Hxc+WJZx1P+NhcU20eanqR7dahbkaN2tYy9lPoS2R6bdS6E0jBL0MG95pQKjJqTQWbtJ98IyE1TuIhDSf23yssE2QE6ZofzbQz/mVWnKqOHDQ3jIDuCS6ypWn6OzMyKgu9Nan+b3S8tJBIvERND4i/dzrB3VsTT/iCBx3gbQIwKf7cLDrOJMFLUHe3c66Ka4BDnVANzcKwKs6Aw3EAjjMuZQuc/kWVXj7457zV25LZAC7IZc5BWrt922u1bKWZlkzf84uA+3BbcR++OI9ANsflhLxEsE5Pr1BMjboO7/I4ZgQnittfJHd9LoM1kTaa47n3J3RALRK4X4Ng8PvfZgpeyQEhrsyKcBJc+MZoij/d/YmbMspfCk++6Z75JTT1+YikDkHdM8mOT/q+rXZx0g2U+2zKoWglHUW5fiq9h3wN7BV4+1RjJGJ/xvkjwMG9ikbik2a+gmQ3AgtrB6+Pxf3LuGs1eJqng5x0ECt02WA0Xiz5EMU+zs1MxFylqIaIstGD02lVvCY1ofXTNMxYmCxIBPO8cXBZBwL3o3dyxMCGbCU0dsrGCX49bSxKLAP0V6w2+dZXPNW4PGRWR3pEbL6g9W+M6yLsKCmMpVs+mWuFmFQ6ivm2wja4L9Elw6tGGluj48OysRiiIPpYB55nYzLEcT0yHpHNu9biRdI5mfzQXBhReImxA9lpK+qa7ShFi7zlFvH+QUT4JI/aX3TPwstVpA+JQnR/xVES5VBoMzJ71YVPjtp/Ya8kL0kUHRO1FlPXiaRtDK/5odR4rgUPPUMBpXxUhPG4bMVtfBp7oltpoA1eGZXDGeJbC19L264zalHPz2U8UyOJcqdyCfjckVDwtzLiUu1Yu8abEuOfjFkxB1eMtAUTPiAiI7kSyhB8r88fzAmvwl15xKnXf2esJnvLoY+/BgvUMApw6hbtF5IJ3L719Izjj1MyugCDSM8yBXKOvIYA5uImFKXdGclynqEO9R0iN1pezKvanyl2axCG1liSlAzu8ojbJAv5RL+yHHCva1p9oC7UHTyTiqQHnM7hwRbbHmZgjaODtq12GFHUXgdBxVGm3k1/91DOO1LZB+VhyUBlEdQff74UfC8sx80H61XfPoAig1LDryfVDFpnx9khynoZPo6W9zpbzuskDwL0rUAnrhpfceCWo0InoPM1kPsy4Rf4HtnKQEXbXRrsX6OgGbi3/EdG2oTQSQzFEJqAAA==';

export default function IndustrialpediaLoader({ fullScreen = false, label = 'Cargando Industrialpedia…' }) {
  return (
    <div className={fullScreen ? 'fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#080d12]' : 'flex min-h-[360px] items-center justify-center overflow-hidden'}>
      <div className="flex flex-col items-center justify-center px-4">
        <div className="capu-loader relative h-56 w-56 sm:h-72 sm:w-72" aria-label="Industrialpedia cargando">
          <img src={CAPU_IMAGE} alt="Capuchina, mascota de Industrialpedia" className="capu-base absolute inset-0 h-full w-full object-contain select-none" draggable="false" />
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-center text-[11px] uppercase tracking-[0.16em] text-white/50 sm:text-xs">
            <span>{label}</span>
            <span className="inline-flex gap-0.5" aria-hidden="true"><span className="capu-dot d1">.</span><span className="capu-dot d2">.</span><span className="capu-dot d3">.</span></span>
          </div>
          <div className="h-px w-40 max-w-[60vw] overflow-hidden bg-white/10"><div className="capu-progress h-full w-1/3 bg-[#5a9cd9]" /></div>
        </div>

        <style>{`
          .capu-loader { filter: drop-shadow(0 16px 24px rgba(0,0,0,.32)); }
          .capu-base {
            display: block;
            image-rendering: auto;
            backface-visibility: hidden;
            transform: translateZ(0);
            /* El negro del fondo está integrado en el archivo original: screen lo fusiona visualmente con el fondo de Industrialpedia. */
            mix-blend-mode: screen;
            filter: contrast(1.06) brightness(1.06) saturate(.96);
            animation: capu-tremble 2.4s ease-in-out infinite;
          }
          @keyframes capu-tremble {
            0%, 100% { transform: translate3d(0,0,0) rotate(0deg); }
            18% { transform: translate3d(-0.7px,0.4px,0) rotate(-0.25deg); }
            32% { transform: translate3d(0.6px,-0.5px,0) rotate(0.22deg); }
            46% { transform: translate3d(-0.45px,0.25px,0) rotate(-0.16deg); }
            60% { transform: translate3d(0.5px,0.35px,0) rotate(0.18deg); }
            76% { transform: translate3d(-0.35px,-0.3px,0) rotate(-0.12deg); }
          }
          .capu-dot { animation: capu-dot 1.1s ease-in-out infinite; }
          .capu-dot.d1 { animation-delay: -0.22s; }
          .capu-dot.d2 { animation-delay: -0.11s; }
          .capu-progress { animation: capu-progress 1.5s ease-in-out infinite; }
          @keyframes capu-dot { 0%,80%,100% { opacity:.25; transform:translateY(0); } 40% { opacity:1; transform:translateY(-2px); } }
          @keyframes capu-progress { 0% { transform:translateX(-140%); } 50% { transform:translateX(120%); } 100% { transform:translateX(320%); } }
          @media (prefers-reduced-motion: reduce) { .capu-base,.capu-dot,.capu-progress { animation:none !important; } }
        `}</style>
      </div>
    </div>
  );
}