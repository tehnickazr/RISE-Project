// Importing a spreadsheet into a new content version.

import { pool } from '../db/pool.js';
import { loadSheetContent, invalidateSheetCache } from '../sheets/loader.js';
import { currentVersionId, loadContentByVersion } from './store.js';

/**
 * What changed between two versions, for a person deciding whether to keep it.
 *
 * Compared by id, then field by field. "Changed" counts a scenario whose title
 * moved a comma as much as one whose expected answers were rewritten, which is
 * blunt — but the alternative is ranking edits by importance, and a summary
 * that decides for the reader which changes matter is worse than one that
 * simply counts them.
 */
function diff(before, after) {
  const compare = (a, b, key) => {
    const byId = new Map(a.map((r) => [r[key], r]));
    const seen = new Set();
    let added = 0;
    let changed = 0;
    for (const row of b) {
      seen.add(row[key]);
      const old = byId.get(row[key]);
      if (!old) added += 1;
      else if (JSON.stringify(old) !== JSON.stringify(row)) changed += 1;
    }
    const removed = a.filter((r) => !seen.has(r[key])).length;
    return { added, changed, removed };
  };

  return {
    scenarios: compare(before.scenarios, after.scenarios, 'scenario_id'),
    questions: compare(before.questions, after.questions, 'question_id'),
    rubrics: compare(before.rubrics, after.rubrics, 'rubric_id'),
    removed_scenario_ids: before.scenarios
      .filter((s) => !after.scenarios.some((n) => n.scenario_id === s.scenario_id))
      .map((s) => s.scenario_id),
  };
}

/**
 * Read the spreadsheet and store it as a new current version.
 *
 * One transaction. A half-written version that became current would serve a
 * partial catalogue to a class, so either the whole import lands or none of it
 * does and the previous version stays current.
 *
 * Never updates in place. The old version keeps every row it had, which is what
 * lets an interview taken last week still render after a scenario is deleted
 * from the sheet this week.
 */
export async function syncFromSheet({ orgId, sheetId, userId, note }) {
  // Always re-read: an administrator pressing sync has usually just edited the
  // sheet, and serving them a five-minute-old copy of it would be its own bug.
  invalidateSheetCache(sheetId);
  const fresh = await loadSheetContent(sheetId);

  const previousId = await currentVersionId(orgId);
  const previous = previousId
    ? await loadContentByVersion(previousId)
    : { scenarios: [], questions: [], rubrics: [] };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: created } = await client.query(
      `INSERT INTO content_versions
         (org_id, source_sheet_id, imported_by, note,
          scenario_count, question_count, rubric_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, imported_at`,
      [orgId, sheetId, userId ?? null, note ?? null,
       fresh.scenarios.length, fresh.questions.length, fresh.rubrics.length]
    );
    const versionId = created[0].id;

    for (const s of fresh.scenarios) {
      await client.query(
        `INSERT INTO content_scenarios
           (version_id, scenario_id, profession, title_sr, title_en, title_fr, title_pt,
            description_sr, description_en, description_fr, description_pt,
            language, difficulty, sector, eqf_level, question_count, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [versionId, s.scenario_id, s.profession, s.title_sr, s.title_en, s.title_fr,
         s.title_pt, s.description_sr, s.description_en, s.description_fr,
         s.description_pt, s.language, s.difficulty, s.sector, s.eqf_level,
         s.question_count ?? null, s.active]
      );
    }
    for (const q of fresh.questions) {
      await client.query(
        `INSERT INTO content_questions
           (version_id, question_id, scenario_id, "order", question_sr, question_en,
            question_fr, question_pt, type, competency, expected_answer,
            eqf_level, type_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [versionId, q.question_id, q.scenario_id, q.order, q.question_sr,
         q.question_en, q.question_fr, q.question_pt, q.type, q.competency,
         q.expected_answer, q.eqf_level, q.type_source]
      );
    }
    for (const r of fresh.rubrics) {
      await client.query(
        `INSERT INTO content_rubrics
           (version_id, rubric_id, scenario_id, competency, label_sr, label_en,
            label_fr, label_pt, description_sr, description_en, description_fr,
            description_pt, weight)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [versionId, r.rubric_id, r.scenario_id, r.competency, r.label_sr,
         r.label_en, r.label_fr, r.label_pt, r.description_sr, r.description_en,
         r.description_fr, r.description_pt, r.weight]
      );
    }

    await client.query(
      'UPDATE content_versions SET is_current = false WHERE org_id = $1 AND is_current',
      [orgId]
    );
    await client.query('UPDATE content_versions SET is_current = true WHERE id = $1', [versionId]);

    // The first sync adopts the organization's existing sessions. At this exact
    // moment the new version is byte-identical to the spreadsheet those
    // sessions have been reading all along, so it is the one point where
    // adopting them changes nothing. Wait, and a later edit would make it a lie.
    if (!previousId) {
      await client.query(
        `UPDATE interview_sessions s
            SET content_version_id = $1
           FROM users u
          WHERE u.id = s.student_id AND u.org_id = $2
            AND s.content_version_id IS NULL`,
        [versionId, orgId]
      );
    }

    await client.query('COMMIT');
    return {
      version_id: versionId,
      imported_at: created[0].imported_at,
      counts: {
        scenarios: fresh.scenarios.length,
        questions: fresh.questions.length,
        rubrics: fresh.rubrics.length,
      },
      diff: diff(previous, fresh),
      adopted_existing_sessions: !previousId,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Make an earlier version current again.
 *
 * The reason versioning earns its keep: a bad import is undone by pointing at
 * the previous version, not by reconstructing a spreadsheet from memory.
 * Sessions keep their own pins, so reverting changes what students can start,
 * never what a finished interview shows.
 */
export async function revertToVersion({ orgId, versionId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id FROM content_versions WHERE id = $1 AND org_id = $2',
      [versionId, orgId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      'UPDATE content_versions SET is_current = false WHERE org_id = $1 AND is_current',
      [orgId]
    );
    await client.query('UPDATE content_versions SET is_current = true WHERE id = $1', [versionId]);
    await client.query('COMMIT');
    return versionId;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
