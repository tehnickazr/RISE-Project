import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_COHORT,
  PeriodQuerySchema,
  change,
  granularityFor,
  isReportable,
  previousWindow,
  suppress,
  windowFor,
} from '../src/stats/rules.js';

const NOW = new Date('2026-09-15T11:00:00.000Z');

test('a rolling window ends now and reaches back the named number of days', () => {
  const w = windowFor({ period: 'd7' }, NOW);
  assert.equal(w.end.toISOString(), '2026-09-15T11:00:00.000Z');
  assert.equal(w.start.toISOString(), '2026-09-08T11:00:00.000Z');
  assert.equal(w.days, 7);
});

test('all time has no start, so nothing has to know when the platform began', () => {
  const w = windowFor({ period: 'all' }, NOW);
  assert.equal(w.start, null);
  assert.equal(w.days, null);
});

test('a custom range includes the whole of its last day', () => {
  const w = windowFor({ period: 'custom', from: '2025-09-01', to: '2026-06-30' }, NOW);
  assert.equal(w.start.toISOString(), '2025-09-01T00:00:00.000Z');
  // Half-open: the 1st of July, so that everything recorded on the 30th counts.
  assert.equal(w.end.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal(w.days, 303);
});

test('a one-day custom range is one day, not zero', () => {
  const w = windowFor({ period: 'custom', from: '2026-03-04', to: '2026-03-04' }, NOW);
  assert.equal(w.days, 1);
  assert.equal(w.end - w.start, 86400000);
});

test('the comparison window is the same length, immediately before', () => {
  const w = windowFor({ period: 'd30' }, NOW);
  const p = previousWindow(w);
  assert.equal(p.end.toISOString(), w.start.toISOString());
  assert.equal(p.days, 30);
  assert.equal(p.start.toISOString(), '2026-07-17T11:00:00.000Z');
});

test('all time has nothing to compare against', () => {
  assert.equal(previousWindow(windowFor({ period: 'all' }, NOW)), null);
});

test('custom ranges compare against the equivalent run-up', () => {
  const w = windowFor({ period: 'custom', from: '2026-03-01', to: '2026-03-31' }, NOW);
  const p = previousWindow(w);
  assert.equal(p.days, 31);
  assert.equal(p.end.toISOString(), '2026-03-01T00:00:00.000Z');
  assert.equal(p.start.toISOString(), '2026-01-29T00:00:00.000Z');
});

test('custom demands both ends, and in order', () => {
  assert.ok(!PeriodQuerySchema.safeParse({ period: 'custom', from: '2026-01-01' }).success);
  assert.ok(!PeriodQuerySchema.safeParse({ period: 'custom', to: '2026-01-01' }).success);
  assert.ok(
    !PeriodQuerySchema.safeParse({ period: 'custom', from: '2026-06-30', to: '2026-01-01' }).success
  );
  assert.ok(
    PeriodQuerySchema.safeParse({ period: 'custom', from: '2026-01-01', to: '2026-06-30' }).success
  );
});

test('no period at all means all time', () => {
  assert.equal(PeriodQuerySchema.parse({}).period, 'all');
});

test('a cohort below the threshold is not reportable, but zero is', () => {
  assert.equal(isReportable(0), true);
  for (let n = 1; n < MIN_COHORT; n += 1) assert.equal(isReportable(n), false, `n=${n}`);
  assert.equal(isReportable(MIN_COHORT), true);
});

test('suppression blanks the figures and keeps the row', () => {
  const row = { school: 'AEVA', n: 1, first: 2.81, latest: 3.34 };
  const out = suppress(row, 1, ['first', 'latest']);
  assert.equal(out.suppressed, true);
  assert.equal(out.suppressed_reason, 'cohort_below_threshold');
  assert.equal(out.first, null);
  assert.equal(out.latest, null);
  // The row itself survives, or it becomes a zero in somebody's chart.
  assert.equal(out.school, 'AEVA');
  assert.equal(out.n, 1);
});

test('suppression does not mutate what it was given', () => {
  const row = { first: 2.81 };
  suppress(row, 1, ['first']);
  assert.equal(row.first, 2.81);
});

test('a reportable row passes through with its figures', () => {
  const out = suppress({ first: 2.93, latest: 3.66 }, 51, ['first', 'latest']);
  assert.equal(out.suppressed, false);
  assert.equal(out.first, 2.93);
});

test('change against nothing is null, not infinity', () => {
  assert.equal(change(14, 0), null);
  assert.equal(change(14, null), null);
  assert.equal(change(14, undefined), null);
  assert.equal(change(0, 10), -1);
  assert.equal(change(11, 10).toFixed(2), '0.10');
});

test('the chart granularity follows the length of the window', () => {
  assert.equal(granularityFor(windowFor({ period: 'd7' }, NOW)), 'day');
  assert.equal(granularityFor(windowFor({ period: 'd30' }, NOW)), 'week');
  assert.equal(granularityFor(windowFor({ period: 'all' }, NOW)), 'month');
  assert.equal(
    granularityFor(windowFor({ period: 'custom', from: '2025-09-01', to: '2026-06-30' }, NOW)),
    'month'
  );
  assert.equal(
    granularityFor(windowFor({ period: 'custom', from: '2026-09-10', to: '2026-09-15' }, NOW)),
    'day'
  );
});
