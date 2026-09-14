import { loadActor } from '../db/scope.js';

export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'unauthenticated' });
    }
    if (req.session.role !== role) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

/**
 * Load the actor onto the request, and refuse a suspended organization.
 *
 * The role in the session is enough to decide *what kind* of thing someone may
 * do; it is not enough to decide *whose records*. That needs the organization,
 * and the organization is read from the database on every request rather than
 * trusted from the cookie — so suspending a school takes effect at once rather
 * than whenever its members' sessions happen to expire.
 *
 * Attaches `req.actor`. Routes should use that and not `req.session`.
 */
export async function withActor(req, res, next) {
  try {
    const actor = await loadActor(req);
    if (!actor) return res.status(401).json({ error: 'unauthenticated' });

    if (actor.role !== 'super_admin' && actor.org_status !== 'active') {
      // Deliberately not "your school is suspended, contact us": the person
      // reading this cannot act on it, and the detail belongs to whoever
      // suspended it.
      return res.status(403).json({ error: 'organization is not active' });
    }

    // The account itself, read fresh on every request for the reason the
    // organisation is: suspending someone has to take effect now, not whenever
    // their session happens to expire. Suspension also deletes their open
    // sessions, so in practice this is the belt to that braces — but a session
    // store is a cache, and a permission check that trusts a cache is not a
    // permission check.
    if (actor.status !== 'active') {
      return res.status(403).json({ error: 'account is not active' });
    }

    req.actor = actor;
    next();
  } catch (err) {
    console.error('[auth] failed to load actor:', err);
    res.status(500).json({ error: 'failed to authenticate' });
  }
}

/** Platform level. Sits outside every organization and reads no student data. */
export function requireSuperAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  if (req.session.role !== 'super_admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
