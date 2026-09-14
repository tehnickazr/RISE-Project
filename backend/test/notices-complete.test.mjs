import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Every privacy notice carries every section, in the same order, with the same
 * parts filled in.
 *
 * The locale test next door exists because a missing interface string renders
 * as nothing and nobody notices. The stakes here are different: a notice with a
 * section missing is not a cosmetic defect, it is a failure to inform under
 * Article 13, in the one document that exists to discharge that duty. And it
 * fails just as silently — the page renders, shorter.
 *
 * English is the reference because every section is drafted in it first.
 *
 * Lives in the backend suite because the frontend has no test runner. The
 * notice modules are plain data with no browser dependency.
 */

const LANGUAGES = ['en', 'sr', 'fr', 'pt'];

const loaded = {};
for (const lang of LANGUAGES) {
  const mod = await import(`../../frontend/src/content/notice.${lang}.js`);
  loaded[lang] = mod.notice;
}

const { NOTICE_LANGUAGES } = await import('../../frontend/src/content/notice.js');

test('every language listed as available actually loads', () => {
  // The list is what the language switcher offers. A language on it with no
  // module is a runtime failure on the notice page.
  assert.deepEqual([...NOTICE_LANGUAGES].sort(), [...LANGUAGES].sort());
});

const reference = loaded.en;

for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
  test(`${lang} has the same sections, in the same order`, () => {
    assert.deepEqual(
      loaded[lang].sections.map((s) => s.id),
      reference.sections.map((s) => s.id)
    );
  });

  test(`${lang} numbers its headings 1..n with nothing skipped`, () => {
    // Section numbers are written into the heading text by hand, so inserting
    // one means renumbering every heading below it in every language. That is
    // exactly the edit where a number gets missed.
    const numbers = loaded[lang].sections.map((s) => Number(s.heading.match(/^(\d+)\./)?.[1]));
    assert.deepEqual(numbers, reference.sections.map((_, i) => i + 1));
  });

  test(`${lang} fills in every part each section has in English`, () => {
    const missing = [];
    for (const [i, ref] of reference.sections.entries()) {
      const theirs = loaded[lang].sections[i];
      for (const key of ['body', 'list', 'table', 'after', 'afterSchool']) {
        if (!ref[key]) continue;
        if (!theirs[key]) missing.push(`${ref.id}.${key} absent`);
        else if (theirs[key].length !== ref[key].length) {
          missing.push(`${ref.id}.${key} has ${theirs[key].length}, English has ${ref[key].length}`);
        }
      }
      // A school placeholder that survived translation as English text is worse
      // than one that is missing: it looks finished.
      for (const key of ['school', 'callout', 'listIntro', 'heading']) {
        if (ref[key] && !theirs[key]) missing.push(`${ref.id}.${key} absent`);
      }
    }
    assert.deepEqual(missing, []);
  });

  test(`${lang} carries the top-level parts and the usage rules`, () => {
    for (const key of ['title', 'backLabel', 'fullBelow', 'schoolBlockLabel', 'headline',
                       'shortSchoolBlock', 'useHeading', 'useIntro']) {
      assert.equal(typeof loaded[lang][key], 'string', `${key} missing`);
      assert.ok(loaded[lang][key].trim().length > 0, `${key} empty`);
    }
    assert.equal(loaded[lang].useRules.length, reference.useRules.length);
    assert.deepEqual(
      loaded[lang].short.map((s) => s.key),
      reference.short.map((s) => s.key)
    );
  });

  test(`${lang} keeps every school placeholder as a placeholder`, () => {
    // <angle brackets> are what render as visibly unfinished. A translator who
    // renders them as prose produces a notice that reads as complete while
    // naming no controller and no retention period.
    //
    // Counted against English rather than merely required, because not every
    // school block has a blank in it: §9 is a statement that applies only to
    // the EU schools and asks them to fill in nothing. Asserting "at least one
    // placeholder everywhere" failed on exactly that section, in all three
    // translations, which was the test being wrong rather than the notices.
    // A translation may legitimately have *fewer* blanks than English: each is
    // written for one country, so it can name the supervisory authority
    // outright where the English reference, serving all three, cannot. Serbian
    // names the Commissioner, French the CNIL, Portuguese the CNPD.
    //
    // What must never happen is a translation with *more* blanks than English
    // — that is a school being asked to supply something nobody expects it to.
    const count = (s) => (s.match(/<[^>]+>/g) ?? []).length;
    const wrong = [];

    for (const [i, ref] of reference.sections.entries()) {
      if (!ref.school) continue;
      const theirs = loaded[lang].sections[i].school;
      if (count(theirs) > count(ref.school)) {
        wrong.push(`${ref.id}: ${count(theirs)} placeholders, English has only ${count(ref.school)}`);
      }
    }

    // The summary block is the exception, and is compared exactly: it is the
    // one every school fills in, and it is the first thing a student reads.
    assert.equal(
      count(loaded[lang].shortSchoolBlock),
      count(reference.shortSchoolBlock),
      'shortSchoolBlock placeholder count must match English'
    );
    assert.deepEqual(wrong, []);
  });
}

test('no notice still contains an untranslated English placeholder', () => {
  // Catches the copy-paste that starts a translation and does not finish it.
  const suspects = [];
  for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
    for (const [i, ref] of reference.sections.entries()) {
      const theirs = loaded[lang].sections[i];
      if (ref.school && theirs.school === ref.school) {
        suspects.push(`${lang}.${ref.id}.school is identical to English`);
      }
    }
  }
  assert.deepEqual(suspects, []);
});
