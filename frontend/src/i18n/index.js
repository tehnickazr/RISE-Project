import { useAuth } from '../auth/AuthContext.jsx';
import { DEFAULT_LANGUAGE, normalizeLanguage } from './languages.js';
import sr from './locales/sr.js';
import en from './locales/en.js';
import fr from './locales/fr.js';
import pt from './locales/pt.js';

export const locales = { sr, en, fr, pt };

export function getTranslations(language = DEFAULT_LANGUAGE) {
  return locales[normalizeLanguage(language)] ?? locales[DEFAULT_LANGUAGE];
}

export function useT(languageOverride) {
  const { user } = useAuth();
  return getTranslations(languageOverride ?? user?.preferred_language);
}

export { localized, normalizeLanguage, browserLanguage } from './languages.js';
export { qualificationLabel } from './qualifications.js';
export { sectorLabel, sectorKey } from './sectors.js';

/**
 * BCP-47 tag for date and number formatting.
 *
 * `sr` alone resolves to Cyrillic in Intl, but every Serbian string in the
 * platform — and the partner's own glossary — is Latin script. Asking for
 * Cyrillic month names beside Latin content looks like a bug to the reader.
 */
const DATE_LOCALES = {
  sr: 'sr-Latn-RS',
  en: 'en-GB',
  fr: 'fr-FR',
  pt: 'pt-PT',
};

export function dateLocale(language) {
  return DATE_LOCALES[language] ?? DATE_LOCALES.en;
}
