import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'industrialpedia_compare_selection_v1';
const MAX_SELECTION = 4;

const ComparisonSelectionContext = createContext(null);

function readStoredSelection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id).slice(0, MAX_SELECTION) : [];
  } catch {
    return [];
  }
}

// Bandeja de comparación: selección persistida (localStorage) de hasta 4
// piezas elegidas a mano en distintas tarjetas de resultado, independiente
// del flujo de comparación automática (base + alternativas descubiertas).
export function ComparisonSelectionProvider({ children }) {
  const [selected, setSelected] = useState(() => readStoredSelection());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)); } catch {}
  }, [selected]);

  const isSelected = useCallback((id) => selected.some((p) => p.id === id), [selected]);

  const toggle = useCallback((part) => {
    if (!part?.id) return;
    setSelected((current) => {
      if (current.some((p) => p.id === part.id)) return current.filter((p) => p.id !== part.id);
      if (current.length >= MAX_SELECTION) return current;
      return [...current, {
        id: part.id,
        part_number: part.part_number || '',
        manufacturer_name: part.manufacturer_name || '',
        image_url: part.image_url || ''
      }];
    });
  }, []);

  const remove = useCallback((id) => setSelected((current) => current.filter((p) => p.id !== id)), []);
  const clear = useCallback(() => setSelected([]), []);

  const value = useMemo(() => ({
    selected,
    count: selected.length,
    maxSelection: MAX_SELECTION,
    isFull: selected.length >= MAX_SELECTION,
    isSelected,
    toggle,
    remove,
    clear
  }), [selected, isSelected, toggle, remove, clear]);

  return <ComparisonSelectionContext.Provider value={value}>{children}</ComparisonSelectionContext.Provider>;
}

export function useComparisonSelection() {
  const ctx = useContext(ComparisonSelectionContext);
  if (!ctx) throw new Error('useComparisonSelection debe usarse dentro de ComparisonSelectionProvider');
  return ctx;
}
