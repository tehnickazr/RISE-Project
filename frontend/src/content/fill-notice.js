import { formatPeriod } from '../i18n/periods.js';

/**
 * Put the school's own details into the notice.
 *
 * The notice files are legal text under review, and they are not touched by
 * this. Each `school:` sentence already carries its blanks as `<…>` in its own
 * language — `<period>`, `<durée>`, `<período>` — and this replaces the *nth*
 * blank in a section with the *nth* value from that section's list below.
 *
 * Positional rather than named, deliberately. Naming the tokens would mean
 * editing five files of reviewed legal prose in four languages to introduce
 * `{placeholders}`, and the ordering is already identical across all of them —
 * verified: every language names the controller before the officer, and the
 * retention sentence gives answers before accounts. The one real divergence is
 * that the Serbian, French and Portuguese notices name their supervisory
 * authority in their own text while the English one leaves a blank, and that
 * needs no special case: a section simply runs out of blanks before it runs out
 * of values, and the extra values are dropped.
 *
 * **An unfilled value leaves its blank exactly as it was.** That is the point of
 * the whole design: a gap has to look like a gap, so a school that has not
 * finished cannot ship a notice that merely reads as though it had.
 */
const TOKENS = {
  summary: ['short_name', 'dpo', 'retention_answers'],
  who: ['legal_name', 'dpo'],
  why: ['basis'],
  'how-long': ['retention_answers', 'retention_account'],
  rights: ['dpo', 'authority'],
};

/** The staff notice asks the same questions about a different person. */
const STAFF_TOKENS = {
  ...TOKENS,
  why: ['basis_staff'],
  'how-long': ['retention_staff'],
};

/**
 * Each lawful basis, already written in all four languages.
 *
 * A choice rather than free text so the notice names a basis the GDPR actually
 * recognises — and so that the same choice reads correctly to a student in
 * Zrenjanin, in Arras and in Aveiro without anybody translating anything.
 */
const BASIS = {
  public_task: {
    en: 'Article 6(1)(e) — public task',
    sr: 'član 6(1)(e) — obavljanje poslova u javnom interesu',
    fr: 'article 6, paragraphe 1, point e) — mission d’intérêt public',
    pt: 'artigo 6.º, n.º 1, alínea e) — exercício de funções de interesse público',
  },
  legal_obligation: {
    en: 'Article 6(1)(c) — legal obligation',
    sr: 'član 6(1)(c) — zakonska obaveza',
    fr: 'article 6, paragraphe 1, point c) — obligation légale',
    pt: 'artigo 6.º, n.º 1, alínea c) — obrigação jurídica',
  },
  consent: {
    en: 'Article 6(1)(a) — consent',
    sr: 'član 6(1)(a) — pristanak',
    fr: 'article 6, paragraphe 1, point a) — consentement',
    pt: 'artigo 6.º, n.º 1, alínea a) — consentimento',
  },
  contract: {
    en: 'Article 6(1)(b) — contract',
    sr: 'član 6(1)(b) — ugovor',
    fr: 'article 6, paragraphe 1, point b) — contrat',
    pt: 'artigo 6.º, n.º 1, alínea b) — contrat',
  },
};

function valuesFor(settings, language) {
  const basis = (key) => (key ? BASIS[key]?.[language] ?? BASIS[key]?.en ?? null : null);
  return {
    short_name: settings.short_name,
    legal_name: settings.legal_name,
    // Assembled once on the server: name, email, and the telephone only when
    // there is one. An optional field left blank must leave no trace.
    dpo: settings.dpo,
    basis: basis(settings.lawful_basis_students),
    basis_staff: basis(settings.lawful_basis_staff),
    retention_answers: formatPeriod(settings.retention_answers, language),
    retention_account: formatPeriod(settings.retention_account, language),
    retention_staff: formatPeriod(settings.retention_staff, language),
    authority: settings.supervisory_authority,
  };
}

/** Replace the blanks in one sentence, in order, keeping any we cannot fill. */
function fillSentence(sentence, tokenNames, values) {
  if (!sentence) return sentence;
  let i = 0;
  return sentence.replace(/<[^>]+>/g, (original) => {
    const name = tokenNames[i];
    i += 1;
    const value = name ? values[name] : null;
    return value ?? original;
  });
}

/**
 * A notice with the school's details in it.
 *
 * Returns a new object; the loaded module is shared between renders and
 * mutating it would leave one school's details in another's notice after a
 * language switch.
 */
export function fillNotice(notice, settings, language, { staff = false } = {}) {
  if (!notice || !settings) return notice;
  const values = valuesFor(settings, language);
  const table = staff ? STAFF_TOKENS : TOKENS;

  return {
    ...notice,
    shortSchoolBlock: fillSentence(notice.shortSchoolBlock, table.summary, values),
    sections: notice.sections.map((section) =>
      section.school
        ? { ...section, school: fillSentence(section.school, table[section.id] ?? [], values) }
        : section
    ),
  };
}

/** Does this notice still show a blank to whoever is reading it? */
export function hasVisibleGap(notice) {
  if (!notice) return false;
  const sentences = [
    notice.shortSchoolBlock,
    ...notice.sections.map((s) => s.school),
  ].filter(Boolean);
  return sentences.some((s) => /<[^>]+>/.test(s));
}
