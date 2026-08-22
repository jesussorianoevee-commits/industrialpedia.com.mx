import { useEffect, useState } from 'react';
import { Moon, Sun, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SiteHeader() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('industrialpedia-theme');
    const nextLight = saved === 'light';
    setLight(nextLight);
    document.documentElement.classList.toggle('theme-light', nextLight);
  }, []);

  const toggleTheme = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle('theme-light', next);
    localStorage.setItem('industrialpedia-theme', next ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-30 ip-dark-header backdrop-blur-xl bg-[#0a0e12]/85 border-b border-white/5 transition-colors">
      <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <span className="w-8 h-8 rounded-lg border border-[#5a9cd9]/40 bg-[#5a9cd9]/10 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-[#5a9cd9] shadow-[0_0_12px_rgba(90,156,217,.8)]" />
          </span>
          <span className="ip-invert-text text-white font-bold tracking-[0.18em] text-sm group-hover:text-[#5a9cd9] transition-colors">INDUSTRIALPEDIA</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <Link to="/buscar" className="px-3 py-2 rounded-md text-xs text-white/55 hover:text-white hover:bg-white/5 transition-colors">Buscar</Link>
          <Link to="/comparar-referencia" className="px-3 py-2 rounded-md text-xs text-white/55 hover:text-white hover:bg-white/5 transition-colors">Comparar</Link>
          <Link to="/decidir" className="px-3 py-2 rounded-md text-xs text-white/55 hover:text-white hover:bg-white/5 transition-colors">Decidir</Link>
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label={light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
            title={light ? 'Modo claro activo · Cambiar a oscuro' : 'Modo oscuro activo · Cambiar a claro'}
            className="flex items-center gap-2 h-9 px-3 rounded-md border border-[#5a9cd9]/30 bg-[#5a9cd9]/10 text-[#5a9cd9] hover:bg-[#5a9cd9]/20 hover:border-[#5a9cd9]/60 transition-all"
          >
            {light ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline text-[11px] font-medium">{light ? 'Claro' : 'Oscuro'}</span>
          </button>
          <button className="hidden sm:flex items-center gap-1.5 text-white/55 hover:text-white text-xs px-2">
            <Globe className="w-3.5 h-3.5" /> ES
          </button>
          <Link to="/login" className="px-3.5 py-2 rounded-md border border-white/15 text-white text-xs font-medium hover:bg-white/5 transition-colors">Ingresar</Link>
        </div>
      </div>
    </header>
  );
}