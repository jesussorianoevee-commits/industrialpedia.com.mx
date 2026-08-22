import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';

export const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

const translations = {
  es: { search: 'Buscar', compare: 'Comparar', decide: 'Decidir', login: 'Ingresar', light: 'Claro', dark: 'Oscuro', language: 'Idioma' },
  en: { search: 'Search', compare: 'Compare', decide: 'Decide', login: 'Sign in', light: 'Light', dark: 'Dark', language: 'Language' },
  de: { search: 'Suchen', compare: 'Vergleichen', decide: 'Entscheiden', login: 'Anmelden', light: 'Hell', dark: 'Dunkel', language: 'Sprache' },
  fr: { search: 'Rechercher', compare: 'Comparer', decide: 'Décider', login: 'Connexion', light: 'Clair', dark: 'Sombre', language: 'Langue' },
  zh: { search: '搜索', compare: '比较', decide: '决策', login: '登录', light: '浅色', dark: '深色', language: '语言' },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('industrialpedia-language') || 'es');
  useEffect(() => localStorage.setItem('industrialpedia-language', language), [language]);
  const value = useMemo(() => ({ language, setLanguage, languages: LANGUAGES, t: translations[language] || translations.es }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

// Batch translation lookup: one request for a result page, with the original
// Part data remaining the authoritative fallback. Machine drafts are exposed
// transparently until reviewed/published rather than silently replacing source data.
export async function translateParts(results, language) {
  if (!Array.isArray(results) || results.length === 0 || !language) return results;
  const ids = [...new Set(results.map((r) => r?.id).filter(Boolean))];
  if (ids.length === 0) return results;
  try {
    const translations = await base44.entities.PartTranslation.filter(
      { part_id: { $in: ids }, language },
      null,
      500,
      0,
      ['id', 'part_id', 'language', 'name', 'description', 'status', 'translation_version']
    );
    const byPart = new Map((translations || []).map((t) => [String(t.part_id), t]));
    return results.map((result) => {
      const translation = byPart.get(String(result.id));
      if (!translation?.name) return result;
      return {
        ...result,
        original_name: result.original_name || result.title || result.product_name || result.name || result.product_identity?.short_description || '',
        original_description: result.original_description || result.description || '';
        title: translation.name,
        product_name: translation.name,
        description: translation.description || result.description || '',
        translation_status: translation.status || 'machine_draft',
        translation_version: translation.translation_version || 1,
        translation_language: language,
      };
    });
  } catch {
    return results;
  }
}
