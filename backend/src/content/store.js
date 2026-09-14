// Reading content from the database.
//
// Returns exactly the shape `sheets/loader.js` returns, so the two are
// interchangeable and can be compared row for row. That equivalence is the
// gate this change ships behind — see scripts/check-content-equivalence.mjs.

import { pool } from '../db/pool.js';
import { selectActive } from '../sheets/loader.js';

/**
 * Versions are immutable, so this cache never needs invalidating.
 *
 * That is the quiet win over the spreadsheet cache it replaces. A five-minute
 * TTL was a compromise between staleness and cost, and every value of it was
 * wrong for somebody — too long for an administrator who had just fixed a typo,
 * too short to stop a class of students each triggering a megabyte download.
 * A version's contents cannot change, so it is cached until the process
 * restarts and a sync simply produces a different id.
 */
const _byVersion = new Map();

/** The organization's current version id, or null if it has never synced. */
export async function currentVersionId(orgId) {
  if (!orgId) return null;
  const { rows } = await pool.query(
    'SELECT id FROM content_versions WHERE org_id = $1 AND is_current',
    [orgId]
  );
  return rows[0]?.id ?? null;
}

/** Every version an organization has, newest first. */
export async function listVersions(orgId) {
  const { rows } = await pool.query(
    `SELECT v.id, v.imported_at, v.is_current, v.source_sheet_id, v.note,
            v.scenario_count, v.question_count, v.rubric_count,
            u.display_name AS imported_by_name,
            (SELECT count(*)::int FROM interview_sessions s
              WHERE s.content_version_id = v.id) AS sessions
       FROM content_versions v
       LEFT JOIN users u ON u.id = v.imported_by
      WHERE v.org_id = $1
      ORDER BY v.imported_at DESC`,
    [orgId]
  );
  return rows;
}

/** One version's content, in the loader's shape. */
export async function loadContentByVersion(versionId) {
  if (!versionId) return { scenarios: [], questions: [], rubrics: [] };

  const hit = _byVersion.get(versionId);
  if (hit) return hit;

  const [scenarios, questions, rubrics] = await Promise.all([
    pool.query(
      `SELECT scenario_id, profession, title_sr, title_en, title_fr, title_pt,
              description_sr, description_en, description_fr, description_pt,
              language, difficulty, sector, eqf_level, question_count, active
         FROM content_scenarios WHERE version_id = $1 ORDER BY scenario_id`,
      [versionId]
    ),
    pool.query(
      `SELECT question_id, scenario_id, "order", question_sr, question_en,
              question_fr, question_pt, type, competency, expected_answer,
              eqf_level, type_source
         FROM content_questions WHERE version_id = $1 ORDER BY question_id`,
      [versionId]
    ),
    pool.query(
      `SELECT rubric_id, scenario_id, competency, label_sr, label_en, label_fr,
              label_pt, description_sr, description_en, description_fr,
              description_pt, weight
         FROM content_rubrics WHERE version_id = $1 ORDER BY rubric_id`,
      [versionId]
    ),
  ]);

  const data = {
    scenarios: scenarios.rows.map((r) => ({
      ...r,
      // `question_count` is optional in the sheet and absent rather than null
      // when unset, because the sampler distinguishes "no override" from zero.
      question_count: r.question_count ?? undefined,
    })),
    questions: questions.rows,
    // numeric arrives as a string from pg; the sheet parses it to a number, and
    // the rubric weights are summed and multiplied downstream.
    rubrics: rubrics.rows.map((r) => ({ ...r, weight: Number(r.weight) })),
  };

  _byVersion.set(versionId, data);
  return data;
}

/** Scenarios on offer for a version. Retired ones withheld unless asked for. */
export async function loadScenariosForVersion(versionId, { includeRetired = false } = {}) {
  const { scenarios } = await loadContentByVersion(versionId);
  return selectActive(scenarios, includeRetired);
}

/**
 * One scenario with its questions and rubrics, from a specific version.
 *
 * Deliberately unfiltered by `active`: this is what session replay resolves
 * against, so a retired scenario must still load or every interview taken on it
 * would 404. Callers deciding whether something may be *started* check `active`
 * themselves.
 */
export async function loadScenarioForVersion(versionId, scenarioId) {
  const { scenarios, questions, rubrics } = await loadContentByVersion(versionId);
  const scenario = scenarios.find((s) => s.scenario_id === scenarioId);
  if (!scenario) return null;
  return {
    ...scenario,
    questions: questions
      .filter((q) => q.scenario_id === scenarioId)
      .sort((a, b) => a.order - b.order),
    rubrics: rubrics.filter((r) => r.scenario_id === scenarioId),
  };
}

/**
 * The version a session should resolve against.
 *
 * A pinned version wins. A null means the session predates versioning, and
 * falls back to whatever is current — correct, because the first sync for an
 * organization backfills its own sessions, so a null can only survive where no
 * sync has happened and the content has not moved.
 */
export async function versionForSession(session, orgId) {
  return session.content_version_id ?? (await currentVersionId(orgId));
}

/** Drop the memo for one version. Only useful in tests; versions are immutable. */
export function forgetVersion(versionId) {
  if (versionId) _byVersion.delete(versionId);
  else _byVersion.clear();
}
