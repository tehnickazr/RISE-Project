import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db/pool.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { teacherRouter } from './routes/teacher.js';
import { platformRouter } from './routes/platform.js';
import { meRouter } from './routes/me.js';
import { invitationsRouter } from './routes/invitations.js';
import { scenariosRouter } from './routes/scenarios.js';
import { sessionsRouter } from './routes/sessions.js';
import { studentsRouter } from './routes/students.js';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
const IS_PROD = process.env.NODE_ENV === 'production';

// Invitation links are built from APP_ORIGIN, falling back to the request's own
// Host header (see email/mailer.js). That fallback is a host-header injection:
// a forged Host turns an invite mail into a credential-harvesting link pointing
// at someone else's domain. In production there is exactly one right answer, so
// refuse to start without it rather than silently trusting the request.
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_ORIGIN || '').replace(/\/+$/, '');
if (IS_PROD && !APP_ORIGIN) {
  throw new Error('APP_ORIGIN is required in production');
}

const PgSession = connectPgSimple(session);

const app = express();

if (IS_PROD) {
  // Trust nginx so secure cookies and req.protocol work behind the proxy
  app.set('trust proxy', 1);
}

// The SPA build emits no inline scripts, so script-src can stay strict.
// Styles keep 'unsafe-inline' because React writes style attributes at runtime.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Only in production — locally the app is served over plain http.
        ...(IS_PROD ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    // Nothing is embedded cross-origin, and COEP breaks nothing here, but it
    // also buys nothing — leave the defaults for the rest.
    crossOriginEmbedderPolicy: false,
  })
);

// An interview answer is a few paragraphs. 100kb is generous for that and caps
// both the request parser and, indirectly, what can be pushed into an LLM call.
app.use(express.json({ limit: '100kb' }));

/**
 * Reject state-changing requests that did not originate from this app.
 *
 * The session cookie is already `sameSite: 'lax'`, which blocks the classic
 * cross-site form POST. This is the second layer: it also catches requests with
 * no Origin at all from contexts where a browser would always send one.
 *
 * Non-production allows any localhost origin, because Vite serves the frontend
 * on its own port and proxies through.
 */
function checkOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const stated = req.get('origin') ?? (req.get('referer') ? new URL(req.get('referer')).origin : null);
  if (!stated) return res.status(403).json({ error: 'origin required' });

  const allowed = IS_PROD
    ? stated === APP_ORIGIN
    : /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(stated);

  if (!allowed) return res.status(403).json({ error: 'cross-origin request refused' });
  return next();
}

app.use('/api', checkOrigin);

app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    name: 'rise.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PROD,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', authRouter);
app.use('/api/me', meRouter);
app.use('/api/admin', adminRouter);
app.use('/api/teacher', teacherRouter);
app.use('/api/platform', platformRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/students', studentsRouter);

// Serve built frontend (production)
app.use(express.static(FRONTEND_DIST));

// SPA fallback — non-API GETs return index.html
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next();
  });
});

const PORT = Number(process.env.PORT || 3002);
app.listen(PORT, () => {
  console.log(`rise listening on http://127.0.0.1:${PORT}`);
});
