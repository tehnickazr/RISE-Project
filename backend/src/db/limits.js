// The queries behind the session limits. The rules themselves are in
// ../sessions/limits.js, which touches nothing.

import { pool } from './pool.js';
import { resolveLimits } from '../sessions/limits.js';

/**
 * The platform row. One row exists by construction (migration 0021), but a
 * database restored from before that migration would have none, so this falls
 * back to the same defaults the column definitions carry rather than throwing
 * on a read that every student's dashboard makes.
 */
export async function platformLimits() {
  const { rows } = await pool.query(
    `SELECT attempts_per_scenario, total_interviews, cooldown_days, updated_at, updated_by
       FROM platform_settings WHERE id = true`
  );
  return rows[0] ?? { attempts_per_scenario: 3, total_interviews: 15, cooldown_days: 7 };
}

/**
 * The limits in force for one organization, plus the two sources they came
 * from. The settings page shows all three: an administrator changing a number
 * should be able to see what it is overriding.
 */
export async function effectiveLimits(orgId) {
  const platform = await platformLimits();
  if (!orgId) return { limits: resolveLimits(platform, null), platform, org: null };
  const { rows } = await pool.query(
    `SELECT attempts_per_scenario, total_interviews, cooldown_days
       FROM organizations WHERE id = $1`,
    [orgId]
  );
  const org = rows[0] ?? null;
  return { limits: resolveLimits(platform, org), platform, org };
}

/**
 * How much of their allowance this student has used.
 *
 * One query, three answers: the total, the per-scenario count, and the last
 * time each scenario was started. Every session the student has ever started is
 * counted — unfinished ones included, and every language — for the reasons set
 * out in ../sessions/limits.js.
 *
 * `lastStartedPerScenario` is what makes the cooldown per interview rather than
 * per student: the grouping is by scenario, so each one carries its own
 * timestamp and they cannot interfere with each other. A single
 * `max(started_at)` over the whole student would be one line shorter and would
 * mean any interview blocked every other one.
 */
export async function usageForStudent(studentId) {
  const { rows } = await pool.query(
    `SELECT scenario_id, count(*)::int AS started, max(started_at) AS last_started_at
       FROM interview_sessions
      WHERE student_id = $1
      GROUP BY scenario_id`,
    [studentId]
  );
  const perScenario = {};
  const lastStartedPerScenario = {};
  let total = 0;
  for (const row of rows) {
    perScenario[row.scenario_id] = row.started;
    lastStartedPerScenario[row.scenario_id] = row.last_started_at;
    total += row.started;
  }
  return { total, perScenario, lastStartedPerScenario };
}
