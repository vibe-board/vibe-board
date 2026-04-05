import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';

// Read persisted language from localStorage (zustand persist key)
const persisted = localStorage.getItem('vibe-ui-preferences');
const savedLang = persisted
  ? (JSON.parse(persisted) as { state?: { language?: string } }).state
      ?.language
  : undefined;

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: savedLang || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/**
 * Lazy-load a language resource and switch to it.
 * If the language bundle has already been loaded, just switches directly.
 */
export async function changeLanguage(lang: string): Promise<void> {
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    const mod = await import(`./${lang}.json`);
    i18n.addResourceBundle(lang, 'translation', mod.default);
  }
  await i18n.changeLanguage(lang);
}

export default i18n;
