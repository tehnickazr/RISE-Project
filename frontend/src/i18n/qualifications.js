// EQF is the interoperability key that lets three countries share content.
// It is not a thing a 17-year-old recognises, so students always see the
// qualification their own system uses.
//
// Serbia: NOKS level N maps 1:1 to EQF level N. Shown as the older "stepen"
// naming, which is what Tehnička škola's own content implies — switch to
// "NOKS N" here if they prefer the current legal terminology.

// English is the project's working language rather than a country, so there is
// no national qualification to name. Use a neutral descriptor instead — never
// the raw "EQF n" code, which means nothing to a seventeen-year-old.
const QUALIFICATIONS = {
  fr: { 3: 'CAP', 4: 'Bac Pro', 5: 'BTS' },
  pt: { 3: 'Nível 3', 4: 'Nível 4', 5: 'Nível 5 — CET' },
  sr: { 3: 'III stepen', 4: 'IV stepen', 5: 'V stepen' },
  en: {
    3: 'Upper secondary — vocational',
    4: 'Upper secondary — technical',
    5: 'Post-secondary — specialist',
  },
};

/**
 * Label for an EQF level in the reader's language.
 * Returns '' for content with no level, so callers can skip the chip entirely.
 */
export function qualificationLabel(eqfLevel, language) {
  const level = String(eqfLevel ?? '').trim();
  if (!level) return '';
  // Unknown level: show nothing rather than leaking the raw code.
  return QUALIFICATIONS[language]?.[level] ?? QUALIFICATIONS.en[level] ?? '';
}
