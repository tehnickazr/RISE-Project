import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeActive } from '../src/sheets/loader.js';

/**
 * The `active` column decides whether a scenario stays in circulation. Getting
 * it wrong in the "unset" direction would silently retire the entire content
 * set, so the default matters more than any single value.
 */

test('a row written before the column existed is active', () => {
  for (const value of [undefined, null, '']) {
    assert.equal(normalizeActive(value), true, `${JSON.stringify(value)} should be active`);
  }
});

test('only an explicit negative retires a scenario', () => {
  for (const value of ['FALSE', 'false', 'No', 'n', '0', 'off', 'retired', 'inactive', 'archived']) {
    assert.equal(normalizeActive(value), false, `${value} should retire`);
  }
});

test('the partners write "no" in their own languages', () => {
  for (const value of ['ne', 'NON', 'não', 'nao']) {
    assert.equal(normalizeActive(value), false, `${value} should retire`);
  }
});

test('anything affirmative, or unrecognised, stays active', () => {
  for (const value of ['TRUE', 'true', 'yes', '1', 'da', 'oui', 'sim', 'active', 'x']) {
    assert.equal(normalizeActive(value), true, `${value} should stay active`);
  }
});

test('Google Sheets checkboxes arrive as real booleans', () => {
  assert.equal(normalizeActive(true), true);
  assert.equal(normalizeActive(false), false);
});

test('whitespace and case do not change the meaning', () => {
  assert.equal(normalizeActive('  FALSE  '), false);
  assert.equal(normalizeActive('  '), true, 'a cell of spaces is not an explicit negative');
});

import { selectActive } from '../src/sheets/loader.js';

const rows = [
  { scenario_id: 'a', active: true },
  { scenario_id: 'b', active: false },
  { scenario_id: 'c', active: true },
];

test('retired scenarios are withheld by default', () => {
  assert.deepEqual(selectActive(rows).map((s) => s.scenario_id), ['a', 'c']);
});

test('callers can ask for the whole set', () => {
  assert.deepEqual(selectActive(rows, true).map((s) => s.scenario_id), ['a', 'b', 'c']);
});

test('a row with no active field at all is kept', () => {
  // Belt and braces: the schema defaults this, but a caller passing raw rows
  // must not silently lose every scenario.
  assert.deepEqual(selectActive([{ scenario_id: 'x' }]).map((s) => s.scenario_id), ['x']);
});
