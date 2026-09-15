// The statistics endpoints, for both scopes.
//
// One router, mounted twice: under /api/platform/statistics for a super
// administrator, where it reports on every school, and under
// /api/admin/statistics for a school administrator, where it reports on theirs.
// The scope is decided here, from the actor, and never from anything the client
// sends — a school administrator cannot ask for the platform view by adding a
// parameter, because there is no parameter to add.
//
// Everything returned is an aggregate. No endpoint here returns a name, an
// answer, a score for a person, or a transcript, and none should be added: the
// claim that no administrator can read student work is only true while that
// remains so.

import express from 'express';
import { pool } from '../db/pool.js';
import { PeriodQuerySchema } from '../stats/rules.js';
import { buildReport, reportToCsvFiles } from '../stats/report.js';
import { zipSync } from '../stats/zip.js';

/**
 * @param {(req) => (string|null)} scopeOf  the organization to report on, or
 *        null for the whole platform. A function rather than a value so the
 *        same router serves both mounts.
 */
export function statisticsRouter(scopeOf) {
  const router = express.Router();

  function parsePeriod(req, res) {
    const parsed = PeriodQuerySchema.safeParse({
      period: req.query.period ?? 'all',
      from: req.query.from,
      to: req.query.to,
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return null;
    }
    return parsed.data;
  }

  router.get('/', async (req, res) => {
    const query = parsePeriod(req, res);
    if (!query) return;

    try {
      const report = await buildReport({ orgId: scopeOf(req), query });
      res.json(report);
    } catch (err) {
      console.error('[statistics] failed to build report:', err);
      res.status(500).json({ error: 'failed to build the report' });
    }
  });

  router.get('/export.zip', async (req, res) => {
    const query = parsePeriod(req, res);
    if (!query) return;

    try {
      const orgId = scopeOf(req);
      const report = await buildReport({ orgId, query });

      // The progress rows carry org ids; the export should carry names, since
      // nobody writing a report wants to resolve a uuid by hand.
      const { rows } = await pool.query('SELECT id, name FROM organizations');
      const schoolNames = Object.fromEntries(rows.map((r) => [r.id, r.name]));

      const buf = zipSync(reportToCsvFiles(report, { schoolNames }));
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="rise-statistics-${stamp}.zip"`
      );
      res.send(buf);
    } catch (err) {
      console.error('[statistics] failed to build export:', err);
      res.status(500).json({ error: 'failed to build the export' });
    }
  });

  return router;
}
