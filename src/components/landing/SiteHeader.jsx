import { Moon, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[#0a0e12]/80 border-b border-white/5">
      <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <Moon className="w-4 h-4 text-white/70" />
          <span className="text-white font-bold tracking-[0.22em] text-sm">INDUSTRIALPEDIA</span>
        </Link>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs">
            <Globe className="w-3.5 h-3.5" /> ES
          </button>
          <Link
            to="/login"
            className="px-3.5 py-1.5 rounded-md border border-white/20 text-white text-xs font-medium hover:bg-white/5 transition-colors"
          >
            Ingresar
          </Link>
        </div>
      </div>
    </header>
  );
}