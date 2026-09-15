// The counting behind the statistics pages. The rules are in ../stats/rules.js,
// which touches nothing; this file is only queries.
//
// Two scopes, one set of queries. `orgId` null means the platform view — every
// school — and a uuid means one school. The scope is applied as a parameter
// rather than by building different SQL, so there is exactly one query per
// figure and no second version that can drift.
//
// WHAT IS NOT HERE, and must not be added: any query returning a student's
// name, answer, score, or transcript. Everything below is a count, a sum or a
// mean over a group. The platform administrator's inability to read student
// work is a claim the DPIA rests on, and it holds only while these endpoints
// stay aggregate.
//
// One join worth knowing about: interview_messages carries no org_id. It reaches
// its school through session -> student -> users.org_id. That is deliberate —
// the message belongs to the session, and duplicating the org onto it would
// create a second copy that could disagree after a student moves school.

import { pool } from './pool.js';
import { granularityFor, suppress } from '../stats/rules.js';

/**
 * Scope and window as SQL fragments.
 *
 * `alias` is whatever table in the query reaches users; every caller joins to
 * it. Returning the parameter list alongside the text keeps the numbering in
 * one place: getting $1/$2 out of step between two fragments is the classic way
 * these queries break.
 */
function scoped(orgId, win, { userAlias = 'u', timeColumn }) {
  const params = [];
  const where = [];

  if (orgId) {
    params.push(orgId);
    where.push(`${userAlias}.org_id = $${params.length}`);
  }
  if (win.start) {
    params.push(win.start);
    where.push(`${timeColumn} >= $${params.length}`);
  }
  params.push(win.end);
  where.push(`${timeColumn} < $${params.length}`);

  return { text: where.join(' AND '), params };
}

/** Interviews started and completed, and the students behind them. */
export async function activity(orgId, win) {
  const s = scoped(orgId, win, { timeColumn: 's.started_at' });

  const { rows } = await pool.query(
    `SELECT count(*)::int                                            AS started,
            count(*) FILTER (WHERE s.status = 'completed')::int      AS completed,
            count(*) FILTER (WHERE s.status = 'abandoned')::int      AS abandoned,
            count(*) FILTER (WHERE s.status = 'in_progress')::int    AS in_progress,
            count(DISTINCT s.student_id)::int                        AS practised
       FROM interview_sessions s
       JOIN users u ON u.id = s.student_id
      WHERE ${s.text}`,
    s.params
  );
  return rows[0];
}

/**
 * Accounts. Counted at the end of the window rather than inside it: "how many
 * students are there" is a stock, not a flow, and a 7-day window would
 * otherwise report three students on a platform with two hundred.
 */
export async function accounts(orgId, win) {
  const params = [win.end];
  let where = 'u.created_at < $1';
  if (orgId) {
    params.push(orgId);
    where += ` AND u.org_id = $${params.length}`;
  }
  const since = win.start ? (params.push(win.start), `$${params.length}`) : null;

  // Suspended accounts are counted. A suspended student still sat the
  // interviews their school is reporting on, and excluding the account while
  // including its work would make the two halves of this page disagree.
  const { rows } = await pool.query(
    `SELECT u.role,
            count(*)::int                                          AS total,
            count(*) FILTER (WHERE u.status = 'suspended')::int     AS suspended,
            ${since ? `count(*) FILTER (WHERE u.created_at >= ${since})::int` : 'count(*)::int'} AS created_in_period
       FROM users u
      WHERE ${where}
      GROUP BY u.role`,
    params
  );

  const out = { student: 0, teacher: 0, admin: 0, super_admin: 0, new_students: 0, suspended: 0 };
  for (const r of rows) {
    out[r.role] = r.total;
    out.suspended += r.suspended;
    if (r.role === 'student') out.new_students = r.created_in_period;
  }
  out.staff = out.teacher + out.admin;
  return out;
}

/** The same activity figures, per school. Platform view only. */
export async function activityBySchool(win) {
  const s = scoped(null, win, { timeColumn: 's.started_at' });

  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.country,
            count(s.id)::int                                       AS started,
            count(s.id) FILTER (WHERE s.status = 'completed')::int  AS completed,
            count(DISTINCT s.student_id)::int                       AS practised,
            (SELECT count(*)::int FROM users su
              WHERE su.org_id = o.id AND su.role = 'student'
                AND su.created_at < $${s.params.length})
                                                                    AS students
       FROM organizations o
       -- LEFT, so a school that did nothing in the window appears with zeros
       -- rather than vanishing. A missing row reads as "no such school".
       LEFT JOIN users u ON u.org_id = o.id AND u.role = 'student'
       LEFT JOIN interview_sessions s ON s.student_id = u.id AND ${s.text}
      GROUP BY o.id, o.name, o.country
      ORDER BY completed DESC, o.name`,
    s.params
  );
  return rows;
}

/** Tokens, cost and the environmental figures, from the two call logs. */
export async function utilisation(orgId, win) {
  const m = scoped(orgId, win, { timeColumn: 'm.created_at' });
  const { rows: llm } = await pool.query(
    `SELECT count(*)::int                        AS calls,
            coalesce(sum(m.prompt_tokens), 0)::bigint     AS tokens_in,
            coalesce(sum(m.completion_tokens), 0)::bigint AS tokens_out,
            coalesce(sum(m.cost_eur), 0)::numeric         AS cost_eur,
            coalesce(sum(m.co2e_g), 0)::numeric           AS co2e_g,
            coalesce(sum(m.water_l), 0)::numeric          AS water_l
       FROM interview_messages m
       JOIN interview_sessions s ON s.id = m.session_id
       JOIN users u ON u.id = s.student_id
      WHERE m.llm_model IS NOT NULL AND ${m.text}`,
    m.params
  );

  // transcription_calls carries org_id directly, so it needs no join — but that
  // means the alias the scope helper expects is the table itself.
  const t = scoped(orgId, win, { userAlias: 't', timeColumn: 't.created_at' });
  const { rows: tr } = await pool.query(
    `SELECT count(*)::int                            AS calls,
            coalesce(sum(t.audio_seconds), 0)::numeric AS seconds,
            coalesce(sum(t.cost_eur), 0)::numeric      AS cost_eur,
            coalesce(sum(t.co2e_g), 0)::numeric        AS co2e_g,
            coalesce(sum(t.water_l), 0)::numeric       AS water_l
       FROM transcription_calls t
      WHERE ${t.text}`,
    t.params
  );

  const n = (v) => Number(v ?? 0);
  return {
    calls: llm[0].calls + tr[0].calls,
    llm_calls: llm[0].calls,
    tokens_in: n(llm[0].tokens_in),
    tokens_out: n(llm[0].tokens_out),
    transcription_calls: tr[0].calls,
    transcription_seconds: n(tr[0].seconds),
    cost_eur: n(llm[0].cost_eur) + n(tr[0].cost_eur),
    co2e_g: n(llm[0].co2e_g) + n(tr[0].co2e_g),
    // Stored in litres; the pages want millilitres, and a figure like
    // 0.0000082 L is not a number anybody reads.
    water_ml: (n(llm[0].water_l) + n(tr[0].water_l)) * 1000,
  };
}

/** Typed against dictated, for the answers given in the window. */
export async function answerMode(orgId, win) {
  const s = scoped(orgId, win, { timeColumn: 'f.created_at' });
  const { rows } = await pool.query(
    `SELECT count(*)::int                                  AS answers,
            count(*) FILTER (WHERE f.dictated)::int        AS dictated
       FROM answer_feedback f
       JOIN interview_sessions s ON s.id = f.session_id
       JOIN users u ON u.id = s.student_id
      WHERE ${s.text}`,
    s.params
  );
  const r = rows[0];
  return { answers: r.answers, dictated: r.dictated, typed: r.answers - r.dictated };
}

/** Completed interviews per day, week or month, for the chart. */
export async function trend(orgId, win) {
  const grain = granularityFor(win);
  const s = scoped(orgId, win, { timeColumn: 's.started_at' });

  const { rows } = await pool.query(
    `SELECT date_trunc('${grain}', s.started_at) AS bucket,
            count(*) FILTER (WHERE s.status = 'completed')::int AS completed,
            count(*)::int                                       AS started
       FROM interview_sessions s
       JOIN users u ON u.id = s.student_id
      WHERE ${s.text}
      GROUP BY bucket
      ORDER BY bucket`,
    s.params
  );
  return { granularity: grain, buckets: rows };
}

/**
 * Improvement: a student's first ever completed interview against their most
 * recent one.
 *
 * The window decides *which students are counted* — those who completed an
 * interview inside it — and not which of their interviews are compared. Scoring
 * a week's work against itself would measure nothing, and a student's first
 * interview is a fixed historical fact that a date filter should not be able to
 * move.
 *
 * Only students with at least two completed interviews appear. With one, first
 * and latest are the same session and the change is zero by construction, which
 * would drag every average towards nothing.
 */
export async function progress(orgId, win) {
  const s = scoped(orgId, win, { timeColumn: 's.started_at' });

  const { rows } = await pool.query(
    `WITH in_window AS (
       SELECT DISTINCT s.student_id
         FROM interview_sessions s
         JOIN users u ON u.id = s.student_id
        WHERE s.status = 'completed' AND ${s.text}
     ),
     -- Every completed interview of those students, whenever it happened,
     -- with its mean answer score.
     scored AS (
       SELECT s.student_id, s.id, s.completed_at, u.org_id,
              avg(f.overall_score) AS score
         FROM interview_sessions s
         JOIN in_window w ON w.student_id = s.student_id
         JOIN users u ON u.id = s.student_id
         JOIN answer_feedback f ON f.session_id = s.id
        WHERE s.status = 'completed' AND f.overall_score IS NOT NULL
        GROUP BY s.student_id, s.id, s.completed_at, u.org_id
       HAVING avg(f.overall_score) IS NOT NULL
     ),
     ranked AS (
       SELECT *,
              row_number() OVER (PARTITION BY student_id ORDER BY completed_at)      AS asc_n,
              row_number() OVER (PARTITION BY student_id ORDER BY completed_at DESC) AS desc_n,
              count(*)     OVER (PARTITION BY student_id)                            AS sessions
         FROM scored
     ),
     pairs AS (
       SELECT student_id, org_id,
              max(score) FILTER (WHERE asc_n = 1)  AS first_score,
              max(score) FILTER (WHERE desc_n = 1) AS latest_score
         FROM ranked
        WHERE sessions >= 2
        GROUP BY student_id, org_id
     )
     SELECT org_id,
            count(*)::int                                          AS students,
            avg(first_score)::numeric                              AS first_score,
            avg(latest_score)::numeric                             AS latest_score,
            count(*) FILTER (WHERE latest_score > first_score)::int AS improved,
            count(*) FILTER (WHERE latest_score = first_score)::int AS unchanged,
            count(*) FILTER (WHERE latest_score < first_score)::int AS declined
       FROM pairs
      GROUP BY ROLLUP (org_id)`,
    s.params
  );

  const total = rows.find((r) => r.org_id === null) ?? {
    students: 0,
    first_score: null,
    latest_score: null,
    improved: 0,
    unchanged: 0,
    declined: 0,
  };
  const perOrg = rows.filter((r) => r.org_id !== null);

  const shape = (r) => ({
    org_id: r.org_id ?? null,
    students: r.students,
    first_score: r.first_score === null ? null : Number(r.first_score),
    latest_score: r.latest_score === null ? null : Number(r.latest_score),
    improved: r.improved,
    unchanged: r.unchanged,
    declined: r.declined,
  });

  return {
    total: suppress(shape(total), total.students, ['first_score', 'latest_score']),
    by_org: perOrg.map((r) => suppress(shape(r), r.students, ['first_score', 'latest_score'])),
  };
}

/**
 * The same first-against-latest comparison, per competency.
 *
 * Suppressed per row, not as a block. The first draft did it as a block, on the
 * reasoning that every competency describes the same students — which is false
 * here and real data said so immediately. Each school writes its own rubric, so
 * the competencies are not shared: production has seven, of which two
 * (`adaptability`, `continuous_learning`) belong to a single student's scenario
 * and five belong to eleven to twenty-one students. Block suppression on the
 * smallest cohort blanked the entire table.
 *
 * Rows are returned sorted by cohort size, largest first, so the competencies
 * with something to say are not below a screenful of withheld ones.
 */
export async function progressByCompetency(orgId, win) {
  const s = scoped(orgId, win, { timeColumn: 's.started_at' });

  const { rows } = await pool.query(
    `WITH in_window AS (
       SELECT DISTINCT s.student_id
         FROM interview_sessions s
         JOIN users u ON u.id = s.student_id
        WHERE s.status = 'completed' AND ${s.text}
     ),
     scored AS (
       SELECT s.student_id, s.id AS session_id, s.completed_at, c.competency,
              avg(c.score) AS score
         FROM interview_sessions s
         JOIN in_window w ON w.student_id = s.student_id
         JOIN answer_feedback f ON f.session_id = s.id
         JOIN answer_criterion_scores c ON c.answer_feedback_id = f.id
        WHERE s.status = 'completed'
        GROUP BY s.student_id, s.id, s.completed_at, c.competency
     ),
     ranked AS (
       SELECT *,
              row_number() OVER (PARTITION BY student_id, competency ORDER BY completed_at)      AS asc_n,
              row_number() OVER (PARTITION BY student_id, competency ORDER BY completed_at DESC) AS desc_n,
              count(*)     OVER (PARTITION BY student_id, competency)                            AS n
         FROM scored
     )
     SELECT competency,
            count(*)::int  AS students,
            avg(score) FILTER (WHERE asc_n = 1)::numeric  AS first_score,
            avg(score) FILTER (WHERE desc_n = 1)::numeric AS latest_score
       FROM ranked
      WHERE n >= 2
      GROUP BY competency
      ORDER BY count(*) DESC, competency`,
    s.params
  );

  return rows.map((r) =>
    suppress(
      {
        competency: r.competency,
        students: r.students,
        first_score: Number(r.first_score),
        latest_score: Number(r.latest_score),
      },
      r.students,
      ['first_score', 'latest_score']
    )
  );
}

/**
 * Whether practising more goes with a larger change. Deliberately not windowed:
 * the question is about a student's whole history, and a seven-day slice of it
 * would be noise.
 */
export async function practiceAndImprovement(orgId) {
  const params = [];
  const where = orgId ? (params.push(orgId), 'u.org_id = $1') : 'true';

  const { rows } = await pool.query(
    `WITH scored AS (
       SELECT s.student_id, s.id, s.completed_at, avg(f.overall_score) AS score
         FROM interview_sessions s
         JOIN users u ON u.id = s.student_id
         JOIN answer_feedback f ON f.session_id = s.id
        WHERE s.status = 'completed' AND f.overall_score IS NOT NULL AND ${where}
        GROUP BY s.student_id, s.id, s.completed_at
     ),
     ranked AS (
       SELECT *, row_number() OVER (PARTITION BY student_id ORDER BY completed_at) AS asc_n,
                 row_number() OVER (PARTITION BY student_id ORDER BY completed_at DESC) AS desc_n,
                 count(*)    OVER (PARTITION BY student_id) AS sessions
         FROM scored
     ),
     pairs AS (
       SELECT student_id, sessions,
              max(score) FILTER (WHERE asc_n = 1)  AS first_score,
              max(score) FILTER (WHERE desc_n = 1) AS latest_score
         FROM ranked WHERE sessions >= 2
        GROUP BY student_id, sessions
     )
     SELECT CASE WHEN sessions = 2 THEN '2'
                 WHEN sessions = 3 THEN '3'
                 WHEN sessions BETWEEN 4 AND 5 THEN '4-5'
                 ELSE '6+' END                              AS band,
            count(*)::int                                    AS students,
            avg(latest_score - first_score)::numeric         AS mean_change
       FROM pairs
      GROUP BY band
      ORDER BY band`,
    params
  );

  return rows.map((r) =>
    suppress(
      { band: r.band, students: r.students, mean_change: Number(r.mean_change) },
      r.students,
      ['mean_change']
    )
  );
}
