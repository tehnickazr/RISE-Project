export const SUPPORTED_LANGUAGES = ['sr', 'en', 'fr', 'pt'];

export function isSupportedLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language);
}

export function supportedLanguageMessage() {
  return `language must be ${SUPPORTED_LANGUAGES.join(', ')}`;
}
