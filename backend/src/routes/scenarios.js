import express from 'express';
import { requireAuth, withActor } from '../auth/middleware.js';
import {
  currentVersionId,
  loadScenariosForVersion,
  loadScenarioForVersion,
} from '../content/store.js';
import { scenarioForRole } from '../sheets/visibility.js';
import { DEFAULT_SESSION_LENGTH, TYPE_QUOTA } from './sessions.js';

export const scenariosRouter = express.Router();

/**
 * Teachers get retired scenarios too, carrying `active: false`.
 *
 * Not an admin nicety: the teacher pages resolve a session's scenario title
 * through this list, so withholding retired rows made an interview taken on one
 * display its raw id instead of its name. Students still see only what they may
 * start — that filtering is the whole point of the flag.
 */
scenariosRouter.get('/', requireAuth, withActor, async (req, res) => {
  try {
    const isTeacher = req.session.role === 'teacher' || req.session.role === 'admin';
    // Served from the database, not the spreadsheet. An organization that has
    // never synced has no content — never a fallback to somebody else's.
    const versionId = await currentVersionId(req.actor.org_id);
    if (!versionId) return res.json({ scenarios: [] });
    const scenarios = await loadScenariosForVersion(versionId, { includeRetired: isTeacher });
    res.json({ scenarios });
  } catch (err) {
    console.error('[scenarios] load failed:', err.message);
    res.status(500).json({ error: 'failed to load scenarios' });
  }
});

scenariosRouter.get('/:id', requireAuth, withActor, async (req, res) => {
  try {
    const versionId = await currentVersionId(req.actor.org_id);
    if (!versionId) return res.status(404).json({ error: 'scenario not found' });
    const scenario = await loadScenarioForVersion(versionId, req.params.id);
    if (!scenario) return res.status(404).json({ error: 'scenario not found' });
    const isTeacher = req.session.role === 'teacher' || req.session.role === 'admin';
    res.json({
      scenario: scenarioForRole(scenario, req.session.role),
      // How the bank is actually served, so the content view can show the gap
      // between what a scenario holds and what one student ever sees.
      serving: isTeacher
        ? {
            per_session: scenario.question_count ?? DEFAULT_SESSION_LENGTH,
            quota: Object.fromEntries(TYPE_QUOTA),
          }
        : undefined,
    });
  } catch (err) {
    console.error('[scenarios] load by id failed:', err.message);
    res.status(500).json({ error: 'failed to load scenario' });
  }
});
