// The rules for how many interviews a student may start.
//
// Imported from ../src/sessions/limits.js rather than from the route, so this
// runs without a database. The route is a thin wrapper around these functions
// precisely so that the decisions can be pinned down here.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OrgLimitsSchema,
  PlatformLimitsSchema,
  checkStart,
  cooldownUntil,
  remaining,
  resolveLimits,
} from '../src/sessions/limits.js';

const PLATFORM = { attempts_per_scenario: 3, total_interviews: 15, cooldown_days: 7 };

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-15T09:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);

// ---------------------------------------------------------------------------
// Which numbers apply
// ---------------------------------------------------------------------------

test('a school with no override inherits the platform default', () => {
  assert.deepEqual(
    resolveLimits(PLATFORM, {
      attempts_per_scenario: null,
      total_interviews: null,
      cooldown_days: null,
    }),
    { attempts_per_scenario: 3, total_interviews: 15, cooldown_days: 7 }
  );
});

test('a school overrides one number without disturbing the others', () => {
  assert.deepEqual(
    resolveLimits(PLATFORM, {
      attempts_per_scenario: 5,
      total_interviews: null,
      cooldown_days: null,
    }),
    { attempts_per_scenario: 5, total_interviews: 15, cooldown_days: 7 }
  );
});

// Zero is the "no limit" value, and it is a real choice a school can make. A
// `??` or `||` chain would treat it as absent and hand back the platform's cap
// — silently reinstating a limit the school had turned off.
test('a school that set zero keeps zero rather than inheriting', () => {
  const limits = resolveLimits(PLATFORM, {
    attempts_per_scenario: 0,
    total_interviews: 0,
    cooldown_days: 0,
  });
  assert.equal(limits.attempts_per_scenario, 0);
  assert.equal(limits.total_interviews, 0);
  assert.equal(limits.cooldown_days, 0);
  assert.equal(
    checkStart({
      limits,
      totalStarted: 900,
      scenarioStarted: 900,
      scenarioLastStartedAt: NOW,
      now: NOW,
    }),
    null
  );
});

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

const limits = PLATFORM;

test('a student with nothing started may start', () => {
  assert.equal(checkStart({ limits, totalStarted: 0, scenarioStarted: 0 }), null);
});

test('the third attempt at a scenario is allowed, the fourth is not', () => {
  assert.equal(checkStart({ limits, totalStarted: 2, scenarioStarted: 2 }), null);
  const refused = checkStart({ limits, totalStarted: 3, scenarioStarted: 3 });
  assert.equal(refused?.code, 'limit_attempts');
});

// The rule the schools asked for, and the one most easily got wrong: an
// abandoned sitting is a used attempt. If this ever counts only completed
// sessions, a student can open interviews without limit by never finishing one
// — which is both the expensive case and the useless one.
test('unfinished attempts count against the per-scenario limit', () => {
  // Three started at this scenario, none of them completed.
  const refused = checkStart({ limits, totalStarted: 3, scenarioStarted: 3 });
  assert.equal(refused?.code, 'limit_attempts');
  assert.equal(refused?.limit, 3);
  assert.equal(refused?.used, 3);
});

test('a different scenario is still open once one is exhausted', () => {
  assert.equal(checkStart({ limits, totalStarted: 3, scenarioStarted: 0 }), null);
});

test('the total cap refuses a fresh scenario', () => {
  const refused = checkStart({ limits, totalStarted: 15, scenarioStarted: 0 });
  assert.equal(refused?.code, 'limit_total');
  assert.equal(refused?.limit, 15);
});

// Being told "you have used all three attempts at this interview" when the real
// obstacle is the total would send a student to pick a different occupation and
// meet the same refusal there.
test('an exhausted total is reported ahead of an exhausted scenario', () => {
  const refused = checkStart({ limits, totalStarted: 15, scenarioStarted: 3 });
  assert.equal(refused?.code, 'limit_total');
});

test('zero means no limit on either count', () => {
  assert.equal(
    checkStart({
      limits: { attempts_per_scenario: 0, total_interviews: 15 },
      totalStarted: 4,
      scenarioStarted: 99,
    }),
    null
  );
  assert.equal(
    checkStart({
      limits: { attempts_per_scenario: 3, total_interviews: 0 },
      totalStarted: 99,
      scenarioStarted: 1,
    }),
    null
  );
});

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

test('remaining never goes negative when a limit is lowered under existing use', () => {
  // A school cutting the total from 15 to 5 does not delete the eight
  // interviews a student already took. The counter has to survive that.
  assert.equal(remaining(5, 8), 0);
  assert.equal(remaining(15, 2), 13);
});

test('there is nothing to count down when there is no limit', () => {
  assert.equal(remaining(0, 8), null);
});

// ---------------------------------------------------------------------------
// What the forms may send
// ---------------------------------------------------------------------------

const platformBody = (over = {}) => ({
  attempts_per_scenario: 3,
  total_interviews: 15,
  cooldown_days: 7,
  ...over,
});

test('a school may clear an override, the platform may not', () => {
  assert.equal(
    OrgLimitsSchema.safeParse({
      attempts_per_scenario: null,
      total_interviews: null,
      cooldown_days: null,
    }).success,
    true
  );
  assert.equal(
    PlatformLimitsSchema.safeParse(platformBody({ attempts_per_scenario: null })).success,
    false
  );
  assert.equal(PlatformLimitsSchema.safeParse(platformBody({ cooldown_days: null })).success, false);
});

test('negative and absurd numbers are refused', () => {
  assert.equal(
    PlatformLimitsSchema.safeParse(platformBody({ attempts_per_scenario: -1 })).success,
    false
  );
  assert.equal(
    PlatformLimitsSchema.safeParse(platformBody({ total_interviews: 100000 })).success,
    false
  );
  assert.equal(
    PlatformLimitsSchema.safeParse(platformBody({ attempts_per_scenario: 2.5 })).success,
    false
  );
  // Half a day is not a thing a teacher sets a cooldown to.
  assert.equal(PlatformLimitsSchema.safeParse(platformBody({ cooldown_days: 0.5 })).success, false);
});

// ---------------------------------------------------------------------------
// The cooldown
// ---------------------------------------------------------------------------

test('a scenario never taken has no cooldown', () => {
  assert.equal(cooldownUntil(7, null), null);
  assert.equal(checkStart({ limits, totalStarted: 0, scenarioStarted: 0, now: NOW }), null);
});

test('a second attempt inside the week is refused with a date', () => {
  const refused = checkStart({
    limits,
    totalStarted: 1,
    scenarioStarted: 1,
    scenarioLastStartedAt: daysAgo(2),
    now: NOW,
  });
  assert.equal(refused?.code, 'limit_cooldown');
  assert.equal(refused?.cooldown_days, 7);
  // Five days left of the seven, so the date is five days out.
  assert.equal(new Date(refused.available_at).getTime(), daysAgo(2).getTime() + 7 * DAY);
});

test('the cooldown expires on its own', () => {
  assert.equal(
    checkStart({
      limits,
      totalStarted: 1,
      scenarioStarted: 1,
      scenarioLastStartedAt: daysAgo(7),
      now: NOW,
    }),
    null
  );
});

// The whole point of the clarification: one interview's cooldown must not reach
// any other interview. The student below started scenario A two days ago, which
// is what `scenarioLastStartedAt` carries for A — and for B, which they have
// never taken, it carries nothing. If this ever becomes a single per-student
// timestamp, this test is what fails.
test('each scenario carries its own clock', () => {
  const startedTwoDaysAgo = {
    limits,
    totalStarted: 1,
    scenarioStarted: 1,
    scenarioLastStartedAt: daysAgo(2),
    now: NOW,
  };
  const neverTaken = {
    limits,
    totalStarted: 1,
    scenarioStarted: 0,
    scenarioLastStartedAt: null,
    now: NOW,
  };
  assert.equal(checkStart(startedTwoDaysAgo)?.code, 'limit_cooldown');
  assert.equal(checkStart(neverTaken), null);

  // And two scenarios both in cooldown come back on their own dates, three days
  // apart because they were started three days apart.
  const a = checkStart({ ...startedTwoDaysAgo, scenarioLastStartedAt: daysAgo(5) });
  const b = checkStart({ ...startedTwoDaysAgo, scenarioLastStartedAt: daysAgo(2) });
  assert.equal(
    new Date(b.available_at).getTime() - new Date(a.available_at).getTime(),
    3 * DAY
  );
});

test('a cooldown of zero is no waiting period at all', () => {
  assert.equal(cooldownUntil(0, daysAgo(0)), null);
  assert.equal(
    checkStart({
      limits: { ...limits, cooldown_days: 0 },
      totalStarted: 1,
      scenarioStarted: 1,
      scenarioLastStartedAt: NOW,
      now: NOW,
    }),
    null
  );
});

// Order matters: a student with no attempts left should not be told to come
// back next Tuesday, because next Tuesday will refuse them too.
test('an exhausted scenario is reported ahead of its cooldown', () => {
  const refused = checkStart({
    limits,
    totalStarted: 3,
    scenarioStarted: 3,
    scenarioLastStartedAt: daysAgo(1),
    now: NOW,
  });
  assert.equal(refused?.code, 'limit_attempts');
});

test('an exhausted total is reported ahead of a cooldown', () => {
  const refused = checkStart({
    limits,
    totalStarted: 15,
    scenarioStarted: 1,
    scenarioLastStartedAt: daysAgo(1),
    now: NOW,
  });
  assert.equal(refused?.code, 'limit_total');
});

// Postgres hands back a Date; a JSON round trip hands back a string. Both reach
// this function, and neither may be the one that quietly returns null.
test('the last start is accepted as a Date or as an ISO string', () => {
  const fromDate = cooldownUntil(7, daysAgo(2));
  const fromString = cooldownUntil(7, daysAgo(2).toISOString());
  assert.equal(fromDate.getTime(), fromString.getTime());
  assert.equal(cooldownUntil(7, 'not a date'), null);
});
