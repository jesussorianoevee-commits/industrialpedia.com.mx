import { useEffect, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function GlobalLanguageSelector() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { language, setLanguage, languages, t } = useLanguage();

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={ref} className="fixed right-3 top-3 z-[60] sm:right-4 sm:top-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t.language}
        aria-expanded={open}
        title={t.language}
        className="flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-[#0a0e12]/95 px-3 text-xs text-white/80 shadow-xl backdrop-blur-xl transition-all hover:border-[#5a9cd9]/60 hover:bg-[#111923] hover:text-white"
      >
        <Globe className="h-4 w-4 text-[#5a9cd9]" />
        <span className="font-semibold">{language.toUpperCase()}</span>
        <span className="text-white/30">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] min-w-40 rounded-2xl border border-white/10 bg-[#11161c] p-1.5 shadow-2xl">
          {languages.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                setLanguage(item.code);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${item.code === language ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}
            >
              <span>{item.flag}</span>
              <span>{item.label}</span>
              <span className="ml-auto text-[9px] uppercase opacity-50">{item.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
