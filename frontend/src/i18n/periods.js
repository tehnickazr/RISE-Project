/**
 * "24 months", "24 meseca", "24 mois", "24 meses".
 *
 * A retention period is stored as a number and a unit precisely so that this
 * can happen at the point of display. Typing "two years" into the settings form
 * would have put those English words into the Serbian, French and Portuguese
 * notices — which is the failure this module exists to prevent, and it would
 * have been invisible to whoever typed it.
 *
 * Serbian needs three forms rather than two, and the rule is not "one versus
 * many": 21 takes the singular, 22–24 take the paucal, 25 takes the plural, and
 * it cycles. Getting this wrong is not a cosmetic error in a privacy notice —
 * it is the sentence that tells a fifteen-year-old how long their answers are
 * kept, and it should read as though a person wrote it.
 */

const UNITS = {
  en: {
    days: (n) => (n === 1 ? 'day' : 'days'),
    months: (n) => (n === 1 ? 'month' : 'months'),
    years: (n) => (n === 1 ? 'year' : 'years'),
  },
  sr: {
    days: (n) => srForm(n, 'dan', 'dana', 'dana'),
    months: (n) => srForm(n, 'mesec', 'meseca', 'meseci'),
    years: (n) => srForm(n, 'godina', 'godine', 'godina'),
  },
  fr: {
    days: (n) => (n === 1 ? 'jour' : 'jours'),
    // "mois" is invariable — a plural s here would be a spelling mistake.
    months: () => 'mois',
    years: (n) => (n === 1 ? 'an' : 'ans'),
  },
  pt: {
    days: (n) => (n === 1 ? 'dia' : 'dias'),
    months: (n) => (n === 1 ? 'mês' : 'meses'),
    years: (n) => (n === 1 ? 'ano' : 'anos'),
  },
};

/** one / paucal (2–4) / plural (5+), with the teens exception. */
function srForm(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Format a stored period for one language. Returns null for a period that is
 * not fully set — half of one renders no sentence, and the caller leaves the
 * placeholder visible instead.
 */
export function formatPeriod(period, language) {
  if (!period || !period.value || !period.unit) return null;
  const table = UNITS[language] ?? UNITS.en;
  const word = table[period.unit];
  if (!word) return null;
  return `${period.value} ${word(period.value)}`;
}
