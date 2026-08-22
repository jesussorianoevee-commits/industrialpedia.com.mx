import { useEffect, useState } from 'react';
import { Moon, Sun, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/lib/i18n';

export default function SiteHeader() {
  const [light, setLight] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const { language, setLanguage, languages, t } = useLanguage();

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
      <div className="mx-auto max-w-6xl px-3 sm:px-5 min-h-16 py-2 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-3 group">
          <span className="w-8 h-8 rounded-lg border border-[#5a9cd9]/40 bg-[#5a9cd9]/10 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-[#5a9cd9] shadow-[0_0_12px_rgba(90,156,217,.8)]" />
          </span>
          <span className="ip-invert-text text-white font-bold tracking-[0.12em] sm:tracking-[0.18em] text-xs sm:text-sm group-hover:text-[#5a9cd9] transition-colors">INDUSTRIALPEDIA</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <Link to="/buscar" className="px-3 py-2 rounded-md text-xs text-white/55 hover:text-white hover:bg-white/5 transition-colors">{t.search}</Link>
          <Link to="/comparar-referencia" className="px-3 py-2 rounded-md text-xs text-white/55 hover:text-white hover:bg-white/5 transition-colors">{t.compare}</Link>
          <Link to="/decidir" className="px-3 py-2 rounded-md text-xs text-white/55 hover:text-white hover:bg-white/5 transition-colors">{t.decide}</Link>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={toggleTheme}
            aria-label={light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
            title={light ? 'Modo claro activo · Cambiar a oscuro' : 'Modo oscuro activo · Cambiar a claro'}
            className="flex items-center gap-2 h-9 px-2.5 sm:px-3 rounded-md border border-[#5a9cd9]/30 bg-[#5a9cd9]/10 text-[#5a9cd9] hover:bg-[#5a9cd9]/20 hover:border-[#5a9cd9]/60 transition-all"
          >
            {light ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline text-[11px] font-medium">{light ? t.light : t.dark}</span>
          </button>
          <div className="relative">
            <button type="button" onClick={() => setLanguageOpen((v) => !v)} aria-label={t.language} title={t.language} className="flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-md border border-white/15 bg-white/[0.03] text-white/70 hover:text-white hover:border-[#5a9cd9]/50 hover:bg-[#5a9cd9]/10 text-xs transition-all">
              <Globe className="w-4 h-4 text-[#5a9cd9]" /> <span className="font-semibold">{language.toUpperCase()}</span><span className="text-white/30">▾</span>
            </button>
            {languageOpen && <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-40 rounded-xl border border-white/10 bg-[#11161c] p-1 shadow-2xl">
              {languages.map((item) => <button key={item.code} type="button" onClick={() => { setLanguage(item.code); setLanguageOpen(false); }} className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${item.code === language ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}>
                <span>{item.flag}</span><span>{item.label}</span><span className="ml-auto text-[9px] uppercase opacity-50">{item.code}</span>
              </button>)}
            </div>}
          </div>
          <Link to="/login" className="hidden xs:inline-flex sm:inline-flex px-3.5 py-2 rounded-md border border-white/15 text-white text-xs font-medium hover:bg-white/5 transition-colors">{t.login}</Link>
        </div>
      </div>
    </header>
  );
}