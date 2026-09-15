// The privacy notice, as content rather than as interface strings.
//
// It does not live in i18n/locales/*.js beside button labels: roughly 2 000
// words in each of four languages would ship in every bundle and mix legal text
// with interface copy. Each language is a separate module, loaded on demand by
// the notice page only.
//
// Versioned in git deliberately. Changing a privacy notice should be a reviewed
// change with an author and a date, which is what a commit is.

/**
 * One version across all four languages, not one per language.
 *
 * Per-language versions would let a student on the French text acknowledge
 * v1.0 while the Serbian text is on v1.1, and "which version was this person
 * shown" would stop having an answer. The consequence is a rule: never ship a
 * partial translation. A missing language blocks the release rather than
 * falling back to English — English is not an acceptable privacy notice for a
 * fifteen-year-old in Zrenjanin.
 *
 * Bump only when the meaning changes. Everyone whose stamp is older then sees
 * the new notice at next sign-in.
 */
// 1.1 — 3 September 2026. Voice input added: a new section on dictation, and
// transcription added to what Scaleway does. A new processing operation on a
// new category of data is exactly the case this version number exists for.
//
// **The re-prompt works.** An earlier comment here said it did not — that it
// was the design and not the behaviour, and that a version bump reached nobody
// who had already registered. That was true when it was written and is no
// longer: bumping to 1.2 was observed sending an already-registered
// administrator and an already-registered student to `/privacy/read` at their
// next request, and letting them through once acknowledged.
//
// So treat a bump as what the docstring above says it is: **everyone whose
// stamp is older is stopped at the notice on their next visit.** That is the
// correct behaviour for a change of meaning, and it is also an operational
// event — on a day when a class is signing in for the first time, they will
// each read the notice before they reach an interview.
// 1.2 — 14 September 2026. Two changes of meaning, both in what a school can
// and cannot decide. Section 13 no longer defers to the school: practice
// interviews are not coursework at any partner school, so the notice says so
// outright instead of promising an answer that was never configured. And the
// remaining `<blanks>` are now filled from the school's own settings rather
// than shipping visible — see ./fill-notice.js.
//
// This bump stops everyone at the notice on their next visit. See below.
// 1.3 — Resend removed from the sub-processor table. It was never used: mail
// goes through the school's own mailbox, which is Hostinger's, so the row
// named a company that holds none of this data. Folded into Hostinger's entry
// rather than deleted, or the notice would say nothing about who handles a
// student's email address.
//
// NOTICE_REQUIRES_ACK is deliberately NOT moved. Naming one fewer company, and
// naming the right one, does not put a reader at any disadvantage — there is
// nothing here for anyone to reconsider, and stopping forty-two people to tell
// them so would teach them that these prompts are noise.
export const NOTICE_VERSION = '1.3';

/**
 * The most recent version whose change was *material* — the newest text a
 * reader must be stopped and shown before carrying on.
 *
 * Two different questions were being answered by one number, and conflating
 * them is why bumping to 1.2 stopped twenty-three people who had nothing new to
 * read. `NOTICE_VERSION` identifies the text: it must change whenever a word
 * changes, or "which version was this person shown" stops having an answer.
 * This one asks something else — whether the change is worth interrupting
 * somebody for.
 *
 * 1.1 is material: it added voice input, which is a new processing operation on
 * a new category of data. Nobody should meet that for the first time without
 * being told.
 *
 * 1.2 is not. It fills in blanks the notice already promised would be filled —
 * the school's own name, its data protection officer, how long answers are
 * kept — and it replaces "your school decides whether this is coursework" with
 * "it is not, and declining has no academic consequence". No new data, no new
 * recipient, no new purpose, no new retention, and the one substantive change
 * is in the reader's favour. The lawful basis is Article 6(1)(e), a public
 * task, so this record evidences that information was provided; it is not
 * consent, and there is nothing here to consent to again.
 *
 * Raise this only when a change genuinely needs re-reading. Raising it for
 * every edit teaches people to click through the notice, which costs more than
 * it protects.
 */
export const NOTICE_REQUIRES_ACK = '1.1';

/** Dotted versions, compared as numbers so '1.10' sorts after '1.9'. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Must this person be stopped and shown the notice before continuing?
 *
 * No stamp means never shown, which is not the same as "shown something old"
 * but is treated the same way: both need reading. A stamp at or after the last
 * material version does not — that reader has seen everything that mattered,
 * and the current text is a click away on their account page whenever they want
 * it.
 */
export function needsAcknowledgement(noticeVersion) {
  if (!noticeVersion) return true;
  return compareVersions(noticeVersion, NOTICE_REQUIRES_ACK) < 0;
}

/**
 * Languages with a complete notice. Gate any new language on this list.
 *
 * All four as of 3 September 2026. French and Portuguese were written for
 * Lycée Jacques Le Caron and AEVA respectively — Portuguese in the European
 * variant, since the reader is a student in Aveiro rather than in Brazil.
 * Until that date these two fell back to English, which is not an acceptable
 * privacy notice for a fifteen-year-old in Arras or Aveiro.
 */
export const NOTICE_LANGUAGES = ['sr', 'en', 'fr', 'pt'];

const LOADERS = {
  sr: () => import('./notice.sr.js'),
  en: () => import('./notice.en.js'),
  fr: () => import('./notice.fr.js'),
  pt: () => import('./notice.pt.js'),
};

/**
 * Staff get a different notice, not a translated one.
 *
 * The student notice is about interview answers written by a minor, and almost
 * none of it applies to a teacher. What does apply to staff and not to students
 * is that the platform records what they open — reusing the student text would
 * have buried the only paragraph this reader needs.
 *
 * English only, and deliberately: staff are adults on an English-language
 * Erasmus+ project, and Article 12's child-appropriate wording requirement does
 * not apply to them. Adding a language here is the same work as adding one
 * above, if a partner asks.
 */
const STAFF_LOADERS = {
  en: () => import('./notice.staff.en.js'),
};

export const STAFF_NOTICE_LANGUAGES = ['en'];

export function isStaffRole(role) {
  return role === 'teacher' || role === 'admin';
}

export function hasNotice(language) {
  return NOTICE_LANGUAGES.includes(language);
}

/**
 * Load one language's notice. Falls back to English only for a language that
 * was never translated — which should not happen in a shipped release, and is
 * a bug rather than a feature if it does.
 */
export async function loadNotice(language, { staff = false } = {}) {
  const table = staff ? STAFF_LOADERS : LOADERS;
  const load = table[language] ?? table.en;
  const module = await load();
  return module.notice;
}
