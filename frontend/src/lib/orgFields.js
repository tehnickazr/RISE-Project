// Helpers for the organisation form: countries, and turning a name into a slug.

/**
 * A slug from an organisation's name.
 *
 * The partner names carry diacritics in three alphabets — Žabalj, Lycée,
 * Valorização — and a naive strip would produce "abalj", "lyce" and
 * "valorizao". NFD splits a letter into its base plus its accent so the accents
 * can be dropped and the base kept; `đ` and `ø` do not decompose that way and
 * are mapped by hand.
 *
 * Not reversible and not meant to be: the slug is an identifier, the name is
 * the name. It is offered as a suggestion and stays editable, because a school
 * may already be known by something shorter than its legal title.
 */
export function slugify(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[øØ]/g, 'o')
    .replace(/[ßẞ]/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * Countries, as ISO 3166-1 alpha-2 with an English name.
 *
 * The three partner countries first because they are what anyone using this
 * console is actually creating, then the rest of the EU and the neighbourhood.
 * Stored as the code; the name is only ever for reading.
 */
export const COUNTRIES = [
  ['RS', 'Serbia'],
  ['FR', 'France'],
  ['PT', 'Portugal'],
  ['AT', 'Austria'], ['BA', 'Bosnia and Herzegovina'], ['BE', 'Belgium'],
  ['BG', 'Bulgaria'], ['CH', 'Switzerland'], ['CY', 'Cyprus'],
  ['CZ', 'Czechia'], ['DE', 'Germany'], ['DK', 'Denmark'],
  ['EE', 'Estonia'], ['ES', 'Spain'], ['FI', 'Finland'],
  ['GR', 'Greece'], ['HR', 'Croatia'], ['HU', 'Hungary'],
  ['IE', 'Ireland'], ['IS', 'Iceland'], ['IT', 'Italy'],
  ['LI', 'Liechtenstein'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'],
  ['LV', 'Latvia'], ['ME', 'Montenegro'], ['MK', 'North Macedonia'],
  ['MT', 'Malta'], ['NL', 'Netherlands'], ['NO', 'Norway'],
  ['PL', 'Poland'], ['RO', 'Romania'], ['SE', 'Sweden'],
  ['SI', 'Slovenia'], ['SK', 'Slovakia'], ['TR', 'Türkiye'],
  ['AL', 'Albania'], ['MD', 'Moldova'], ['UA', 'Ukraine'], ['XK', 'Kosovo'],
  ['GB', 'United Kingdom'],
];

const BY_CODE = new Map(COUNTRIES.map(([code, name]) => [code, name]));

/**
 * The country's name for display.
 *
 * Falls back to whatever is stored. Rows created before this was a fixed list
 * hold free text — one says "Srbija" — and showing that is more honest than
 * showing a blank or pretending it is a code.
 */
export function countryName(code) {
  if (!code) return '—';
  return BY_CODE.get(String(code).toUpperCase()) ?? code;
}

export const LANGUAGES = [
  ['sr', 'Srpski'],
  ['en', 'English'],
  ['fr', 'Français'],
  ['pt', 'Português'],
];
