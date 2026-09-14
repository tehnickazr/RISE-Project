export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['sr', 'en', 'fr', 'pt'];

export function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

export function localized(row, field, language) {
  const lang = normalizeLanguage(language);
  return row?.[`${field}_${lang}`] || row?.[`${field}_en`] || row?.[`${field}_sr`] || '';
}

/**
 * The best guess at someone's language before they have told us.
 *
 * Used only on the two screens whose whole population is people who cannot
 * sign in — there is no account to read a preference from, and the choice is
 * otherwise English for everyone.
 *
 * A guess, not a fact: a Serbian student whose phone is set to English gets
 * English, exactly as they do today. It can only improve on the alternative.
 *
 * Matched on the primary subtag so `sr-Latn-RS`, `sr-RS` and `sr` all land on
 * Serbian, and `pt-BR` on Portuguese — which is not the variant the notice is
 * written in, but is far closer than English.
 */
export function browserLanguage() {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const primary = String(tag ?? '').toLowerCase().split('-')[0];
    if (SUPPORTED_LANGUAGES.includes(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}
