import { Cpu, ShieldCheck, FileText, Database, Link2 } from 'lucide-react';

// Cadena de trazabilidad conceptual: PART → SPECIFICATION → PROVENANCE → EVIDENCE → DOCUMENT → SOURCE
const STEPS = [
  { icon: Cpu, label: 'Part', countKey: 'parts' },
  { icon: FileText, label: 'Specification', countKey: 'specs' },
  { icon: Link2, label: 'Provenance', countKey: 'provenance' },
  { icon: ShieldCheck, label: 'Evidence', countKey: 'evidence' },
  { icon: FileText, label: 'Document', countKey: 'documents' },
  { icon: Database, label: 'Source', countKey: 'sources' }
];

export default function TraceabilityChain({ counts }) {
  return (
    <div className="hidden">
      <div className="text-white/40 text-[11px] uppercase tracking-wide mb-3">Cadena de trazabilidad</div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-1 shrink-0">
              <div className="flex flex-col items-center gap-1 px-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${counts[s.countKey] > 0 ? 'bg-[#47bcb6]/10' : 'bg-white/5'}`}>
                  <Icon className={`w-4 h-4 ${counts[s.countKey] > 0 ? 'text-[#47bcb6]' : 'text-white/30'}`} />
                </div>
                <span className="text-white/50 text-[10px]">{s.label}</span>
                <span className="text-white/40 text-[10px]">{counts[s.countKey] || 0}</span>
              </div>
              {i < STEPS.length - 1 && <span className="text-white/20 text-xs">→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}