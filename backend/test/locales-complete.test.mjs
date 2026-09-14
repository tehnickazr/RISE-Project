import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Every language carries every key, with the same shape.
 *
 * A missing key does not throw — it renders as nothing, or as the word
 * `undefined`, in front of whoever is reading. That is how a whole
 * administrator console stayed in English while the student and teacher views
 * were translated: nothing failed, so nobody noticed until someone looked at
 * the screen. English is the reference because it is the language every string
 * is written in first.
 *
 * Lives in the backend suite because the frontend has no test runner. The
 * locale modules are plain data with no browser dependency, so importing them
 * from here costs nothing.
 */

const LANGUAGES = ['en', 'sr', 'fr', 'pt'];
const loaded = {};
for (const lang of LANGUAGES) {
  const mod = await import(`../../frontend/src/i18n/locales/${lang}.js`);
  loaded[lang] = mod.default ?? Object.values(mod)[0];
}

/** Dotted paths to every leaf, plus what kind of leaf it is. */
function shape(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) shape(value, path, out);
    else out.set(path, typeof value);
  }
  return out;
}

const reference = shape(loaded.en);

for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
  test(`${lang} has every key English has`, () => {
    const theirs = shape(loaded[lang]);
    const missing = [...reference.keys()].filter((k) => !theirs.has(k));
    assert.deepEqual(missing, [], `${lang} is missing: ${missing.join(', ')}`);
  });

  test(`${lang} has no key English does not`, () => {
    // Usually a typo, and a typo here is a string nothing will ever render.
    const theirs = shape(loaded[lang]);
    const extra = [...theirs.keys()].filter((k) => !reference.has(k));
    assert.deepEqual(extra, [], `${lang} has unexpected: ${extra.join(', ')}`);
  });

  test(`${lang} keeps functions as functions`, () => {
    // A key written as a plain string where English has a function is called
    // with arguments at render time and throws — the one failure in this file
    // that is loud rather than silent.
    const theirs = shape(loaded[lang]);
    const wrong = [...reference.entries()]
      .filter(([k, kind]) => theirs.has(k) && theirs.get(k) !== kind)
      .map(([k, kind]) => `${k}: expected ${kind}, got ${theirs.get(k)}`);
    assert.deepEqual(wrong, []);
  });
}

test('no locale has an empty string where a reader expects words', () => {
  const empties = [];
  for (const lang of LANGUAGES) {
    for (const [path, kind] of shape(loaded[lang])) {
      if (kind !== 'string') continue;
      const value = path.split('.').reduce((o, k) => o[k], loaded[lang]);
      if (value.trim() === '') empties.push(`${lang}.${path}`);
    }
  }
  assert.deepEqual(empties, []);
});
