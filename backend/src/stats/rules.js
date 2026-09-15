// The rules the statistics obey, with no database and no clock of their own.
//
// Pure for the usual reason: the parts worth being careful about here are not
// the SQL — that is only counting — but the decisions around it. Which window
// does "last 30 days" mean, what does the period compare against, and when is a
// group small enough that publishing its average names somebody. Those are
// testable as functions and untestable as fragments of a query.
//
// `now` is always passed in. A test that had to wait a week would not be run.

import { z } from 'zod';

/**
 * Below this many students, a row is withheld rather than averaged.
 *
 * Five is a convention rather than a law, and the reason for a threshold at all
 * is worth stating: these pages carry no names, but an average over a group of
 * two, published to that group's own teacher, is not anonymous. The people
 * reading it know who the two are. AEVA will meet this constantly — with
 * thirty-eight students, most weekly breakdowns land under the threshold — so
 * this is the normal path rather than the edge case.
 */
export const MIN_COHORT = 5;

export const PERIODS = ['d7', 'd30', 'all', 'custom'];

export const PeriodQuerySchema = z
  .object({
    period: z.enum(PERIODS).default('all'),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((q) => q.period !== 'custom' || (q.from && q.to), {
    message: 'custom needs both from and to',
  })
  .refine((q) => q.period !== 'custom' || q.from <= q.to, {
    message: 'from must not be after to',
  });

/**
 * The window a period means, as half-open [start, end).
 *
 * Half-open because the alternative is `created_at <= end_of_day`, which needs
 * a "last microsecond of the day" that does not exist in a timestamptz column
 * and silently drops anything recorded in the final second. Every caller
 * compares `>= start AND < end`.
 *
 * `all` has a null start: the platform's own beginning, whenever that was, and
 * not a date anybody has to keep in sync with the grant agreement.
 */
export function windowFor(query, now = new Date()) {
  const end = new Date(now);

  if (query.period === 'all') {
    return { start: null, end, label: 'all', days: null };
  }

  if (query.period === 'custom') {
    // A date is a day, and the day named in `to` is included — a report about
    // "1 September to 30 June" means through the end of the 30th.
    const start = new Date(`${query.from}T00:00:00.000Z`);
    const stop = new Date(`${query.to}T00:00:00.000Z`);
    stop.setUTCDate(stop.getUTCDate() + 1);
    return {
      start,
      end: stop,
      label: 'custom',
      days: Math.round((stop - start) / 86400000),
    };
  }

  const days = query.period === 'd7' ? 7 : 30;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { start, end, label: query.period, days };
}

/**
 * The window immediately before this one, of the same length, for comparison.
 *
 * Null for `all`: there is nothing before the beginning, and inventing a
 * comparison there would produce a change figure against an empty set — which
 * renders as an infinite increase and reads as a bug.
 */
export function previousWindow(win) {
  if (!win.start || win.days === null) return null;
  const end = new Date(win.start);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - win.days);
  return { start, end, days: win.days };
}

/**
 * Whether a cohort may be reported at all.
 *
 * Zero is not suppressed. "No student at this school has completed two
 * interviews" reveals nothing about anybody and is a fact the school needs; it
 * is the small non-zero counts that identify people.
 */
export function isReportable(cohortSize) {
  return cohortSize === 0 || cohortSize >= MIN_COHORT;
}

/**
 * Apply the threshold to a row, replacing its figures with a reason.
 *
 * Returns a new object rather than mutating, and keeps the row instead of
 * dropping it — a row that disappears silently becomes a zero in somebody's
 * chart, which is a worse lie than saying nothing.
 */
export function suppress(row, cohortSize, fields) {
  if (isReportable(cohortSize)) return { ...row, suppressed: false };
  const out = { ...row, suppressed: true, suppressed_reason: 'cohort_below_threshold' };
  for (const f of fields) out[f] = null;
  return out;
}

/** Percentage change, or null where there is nothing to compare against. */
export function change(now, before) {
  if (before === null || before === undefined || before === 0) return null;
  return (now - before) / before;
}

/**
 * Which chart granularity suits a window.
 *
 * Thirty daily bars of single digits is a worse picture than four weekly ones,
 * and a monthly chart over seven days is one bar. The boundaries are where the
 * chart stops being readable, not where the arithmetic changes.
 */
export function granularityFor(win) {
  if (win.days === null) return 'month';
  if (win.days <= 10) return 'day';
  if (win.days <= 92) return 'week';
  return 'month';
}
