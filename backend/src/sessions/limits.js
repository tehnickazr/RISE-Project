// Whether a student may start another interview.
//
// Pure: no database, no request, and no clock of its own — `now` is passed in,
// which is what lets the cooldown be tested at a chosen instant rather than by
// waiting a week. The same reason invitations/schema.js is its own module.
//
// The counting rules, which are the part worth being careful about:
//
//   * A session counts from the moment it is *started*, finished or not. A
//     student with three unfinished attempts at one scenario has used all three
//     and may not open a fourth.
//   * Nothing here can stop a student finishing what they started. These
//     functions are called on the create path only; resuming and answering do
//     not consult them.
//   * Attempts are counted per scenario across every language. Practising the
//     same interview in French and then in English is the same interview twice,
//     and counting per language would also mean the cap could be reset by
//     changing one field in a profile.
//   * The cooldown runs per scenario, from that scenario's own last start.
//     Every interview a student has touched carries its own independent clock:
//     starting the electrician interview on Monday says nothing about when the
//     welder interview may be started. There is deliberately no per-student
//     "last attempt" anywhere in this file — that single timestamp is exactly
//     the wrong model, and would make one interview block all the others.

import { z } from 'zod';

/** Zero means no limit. See migration 0021 for why zero and not null. */
export const NO_LIMIT = 0;

export function isLimited(value) {
  return Number.isInteger(value) && value > NO_LIMIT;
}

/**
 * The numbers in force for one school: its own where it set any, the platform's
 * where it did not.
 *
 * Written as an explicit null check rather than `??` chaining a default, so that
 * a school which has deliberately set 0 — no limit — keeps it instead of
 * inheriting the platform's cap.
 */
export function resolveLimits(platform, org) {
  const pick = (orgValue, platformValue, fallback) => {
    if (orgValue !== null && orgValue !== undefined) return Number(orgValue);
    if (platformValue !== null && platformValue !== undefined) return Number(platformValue);
    return fallback;
  };
  return {
    attempts_per_scenario: pick(
      org?.attempts_per_scenario,
      platform?.attempts_per_scenario,
      3
    ),
    total_interviews: pick(org?.total_interviews, platform?.total_interviews, 15),
    cooldown_days: pick(org?.cooldown_days, platform?.cooldown_days, 7),
  };
}

/** A day in milliseconds. Calendar-naive, so a cooldown spanning a daylight
 *  saving change ends an hour early or late — which nobody waiting seven days
 *  for an interview will ever notice, and which is cheaper than carrying a
 *  timezone per school to fix. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When this scenario becomes available again, or null if it already is.
 *
 * `lastStartedAt` is the start of the student's most recent session *at this
 * scenario* — see migration 0022 for why the start rather than the finish.
 * Null when they have never taken it, which is the common case and is not a
 * cooldown.
 */
export function cooldownUntil(days, lastStartedAt) {
  if (!isLimited(days) || !lastStartedAt) return null;
  const last = lastStartedAt instanceof Date ? lastStartedAt : new Date(lastStartedAt);
  if (Number.isNaN(last.getTime())) return null;
  return new Date(last.getTime() + days * DAY_MS);
}

/**
 * May this student start one more interview at this scenario?
 *
 * Returns null when they may, or a refusal carrying a stable `code` — the
 * client translates on the code and never on the sentence, which is English
 * here and read by nobody in the normal case.
 *
 * Three refusals, checked in order of how final they are, because a student who
 * meets more than one at once should be told the most binding:
 *
 *   1. the total  — nothing anywhere will help, so do not suggest trying
 *      another occupation;
 *   2. the attempts at this scenario — permanent for this interview, so
 *      suggesting they come back next week would be a lie;
 *   3. the cooldown — the only one that expires on its own, so it is the only
 *      one that can honestly name a date.
 */
export function checkStart({
  limits,
  totalStarted,
  scenarioStarted,
  scenarioLastStartedAt = null,
  now = new Date(),
}) {
  const {
    attempts_per_scenario: perScenario,
    total_interviews: total,
    cooldown_days: cooldownDays,
  } = limits;

  if (isLimited(total) && totalStarted >= total) {
    return {
      code: 'limit_total',
      error: `You have started all ${total} of your interviews.`,
      limit: total,
      used: totalStarted,
    };
  }

  if (isLimited(perScenario) && scenarioStarted >= perScenario) {
    return {
      code: 'limit_attempts',
      error: `You have used all ${perScenario} attempts at this interview.`,
      limit: perScenario,
      used: scenarioStarted,
    };
  }

  const until = cooldownUntil(cooldownDays, scenarioLastStartedAt);
  if (until && until.getTime() > now.getTime()) {
    return {
      code: 'limit_cooldown',
      error: `You can take this interview again on ${until.toISOString().slice(0, 10)}.`,
      // The date, not a number of days: "in 3 days" computed here and rendered
      // an hour later is wrong, and the client has the student's own locale to
      // format this properly.
      available_at: until.toISOString(),
      cooldown_days: cooldownDays,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// What the settings forms may send
// ---------------------------------------------------------------------------
//
// An upper bound as well as a lower one. Nothing breaks at a thousand
// interviews per student, but a number that large is a typo rather than a
// policy, and the only way anyone would find out is the bill.

const count = z.number().int().min(0).max(999);

/** The platform default. Both numbers always present; there is nothing above
 *  this to inherit from. */
export const PlatformLimitsSchema = z.object({
  attempts_per_scenario: count,
  total_interviews: count,
  cooldown_days: count,
});

/** A school's override. `null` clears it and returns that number to the
 *  platform default — which is why null is accepted rather than treated as a
 *  missing field. */
export const OrgLimitsSchema = z.object({
  attempts_per_scenario: count.nullable(),
  total_interviews: count.nullable(),
  cooldown_days: count.nullable(),
});

/** What is left, for display. `null` where there is no limit to count down. */
export function remaining(limit, used) {
  if (!isLimited(limit)) return null;
  return Math.max(0, limit - used);
}
