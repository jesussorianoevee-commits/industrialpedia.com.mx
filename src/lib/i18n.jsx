import { createContext, useContext, useEffect, useMemo, useState } from 'react';

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
