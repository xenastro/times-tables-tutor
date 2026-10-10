import { Hono, type Context, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { ARABIC_CLIPS } from '../src/engine/arabic';
import { AVATARS, EVENT_TYPES, THEMES, type AudioClipDTO, type DeviceDTO, type LearnerDTO, type LearnerSummaryDTO } from '../src/shared/api';
import { hashPassword, randomDigits, randomToken, sha256, verifyPassword } from './crypto';
import { emailConfigured, sendEmail, type EmailEnv } from './email';

interface Env extends EmailEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Sign-up requires this code; without it, sign-up is closed. */
  INVITE_CODE?: string;
}

interface Vars {
  parentId: string;
  deviceId: string;
  learnerId: string;
}

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const SESSION_COOKIE = 'tt_session';
const SESSION_DAYS = 60;
const PAIRING_MINUTES = 15;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const MAX_EVENTS_PER_SYNC = 500;
const MAX_PAYLOAD_BYTES = 2000;
const EVENTS_PAGE = 5000;

const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api');

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'server_error' }, 500);
});

/* ---------------------------------------------------------------- helpers */

function bad(c: Ctx, error: string, status: 400 | 401 | 403 | 404 | 409 | 429 = 400) {
  return c.json({ error }, status);
}

async function body<T>(c: Ctx): Promise<Partial<T>> {
  try {
    return (await c.req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

function clientIp(c: Ctx): string {
  return c.req.header('cf-connecting-ip') ?? 'local';
}

async function tooManyFailures(c: Ctx, bucket: string): Promise<boolean> {
  const since = Date.now() - FAILURE_WINDOW_MS;
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM failures WHERE bucket = ? AND ts > ?')
    .bind(bucket, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= MAX_FAILURES;
}

async function recordFailure(c: Ctx, bucket: string) {
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO failures (bucket, ts) VALUES (?, ?)').bind(bucket, Date.now()),
    c.env.DB.prepare('DELETE FROM failures WHERE ts < ?').bind(Date.now() - FAILURE_WINDOW_MS),
  ]);
}

interface LearnerRow {
  id: string;
  parent_id: string;
  display_name: string;
  birth_year: number | null;
  avatar: string;
  theme: string;
  settings_json: string;
}

function toLearner(r: LearnerRow): LearnerDTO {
  let settings = {};
  try {
    settings = JSON.parse(r.settings_json);
  } catch {
    /* keep defaults */
  }
  return { id: r.id, displayName: r.display_name, birthYear: r.birth_year, avatar: r.avatar, theme: r.theme, settings };
}

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, 40);
  return s.length ? s : null;
}

function cleanSettings(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') return {};
  const s = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (s.range === 10 || s.range === 12 || s.range === 'auto') out.range = s.range;
  if (s.profile === 'standard' || s.profile === 'young') out.profile = s.profile;
  if (typeof s.sessionLength === 'number' && s.sessionLength >= 10 && s.sessionLength <= 60)
    out.sessionLength = Math.round(s.sessionLength);
  if (s.pictureHints === 'always' || s.pictureHints === 'mistakes' || s.pictureHints === 'off')
    out.pictureHints = s.pictureHints;
  if (typeof s.thresholdOffsetMs === 'number' && Math.abs(s.thresholdOffsetMs) <= 5000)
    out.thresholdOffsetMs = Math.round(s.thresholdOffsetMs);
  if (typeof s.readAloud === 'boolean') out.readAloud = s.readAloud;
  if (s.language === 'en' || s.language === 'ar') out.language = s.language;
  if (s.numerals === 'western' || s.numerals === 'eastern') out.numerals = s.numerals;
  if (typeof s.bilingual === 'boolean') out.bilingual = s.bilingual;
  return out;
}

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

async function eventsPage(c: Ctx, learnerId: string) {
  const since = Number(c.req.query('since') ?? 0) || 0;
  const { results } = await c.env.DB.prepare(
    'SELECT seq, id, type, payload_json, client_ts FROM events WHERE learner_id = ? AND seq > ? ORDER BY seq LIMIT ?',
  )
    .bind(learnerId, since, EVENTS_PAGE)
    .all<{ seq: number; id: string; type: string; payload_json: string; client_ts: number }>();
  return c.json({
    events: results.map((r) => ({ id: r.id, type: r.type, ts: r.client_ts, payload: JSON.parse(r.payload_json) })),
    lastSeq: results.length ? results[results.length - 1].seq : since,
    more: results.length === EVENTS_PAGE,
  });
}

/* ---------------------------------------------------------------- parent auth */

async function startSession(c: Ctx, parentId: string) {
  const token = randomToken();
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, parent_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), parentId, expires)
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/api',
    maxAge: SESSION_DAYS * 86400,
  });
}

function validEmail(e: unknown): e is string {
  return typeof e === 'string' && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

app.post('/auth/signup', async (c) => {
  const b = await body<{ email: string; password: string; inviteCode: string }>(c);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!validEmail(email)) return bad(c, 'invalid_email');
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) return bad(c, 'weak_password');
  // Sign-up is closed unless an invite code is configured, and then requires it.
  if (!c.env.INVITE_CODE || (b.inviteCode ?? '').trim() !== c.env.INVITE_CODE) return bad(c, 'invalid_invite', 403);

  const exists = await c.env.DB.prepare('SELECT 1 FROM parents WHERE email = ?').bind(email).first();
  if (exists) return bad(c, 'email_taken', 409);

  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO parents (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, email, await hashPassword(b.password), Date.now())
    .run();
  await startSession(c, id);
  return c.json({ email });
});

app.post('/auth/login', async (c) => {
  const b = await body<{ email: string; password: string }>(c);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const bucket = `login:${clientIp(c)}`;
  if (await tooManyFailures(c, bucket)) return bad(c, 'too_many_attempts', 429);

  const row = await c.env.DB.prepare('SELECT id, password_hash FROM parents WHERE email = ?')
    .bind(email)
    .first<{ id: string; password_hash: string }>();
  if (!row || typeof b.password !== 'string' || !(await verifyPassword(b.password, row.password_hash))) {
    await recordFailure(c, bucket);
    return bad(c, 'invalid_login', 401);
  }
  await startSession(c, row.id);
  return c.json({ email });
});

app.post('/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/api' });
  return c.json({ ok: true });
});

async function requireParent(c: Ctx, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return bad(c, 'not_signed_in', 401);
  const row = await c.env.DB.prepare('SELECT parent_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await sha256(token), Date.now())
    .first<{ parent_id: string }>();
  if (!row) return bad(c, 'not_signed_in', 401);
  c.set('parentId', row.parent_id);
  await next();
}

/* ---------------------------------------------------------------- password reset & account deletion */

const RESET_MINUTES = 60;

/**
 * Local development only: the reset link comes back in the response (there's no mailbox to read).
 * Needs EMAIL_LOG_LINKS=1 (only ever set in .dev.vars), plain http (the live site is https) and
 * no email provider. (wrangler dev reports the live hostname, so the host can't be checked.)
 */
function devLinks(c: Ctx): boolean {
  return c.env.EMAIL_LOG_LINKS === '1' && new URL(c.req.url).protocol === 'http:' && !emailConfigured(c.env);
}

app.post('/auth/reset-request', async (c) => {
  const bucket = `reset:${clientIp(c)}`;
  if (await tooManyFailures(c, bucket)) return bad(c, 'too_many_attempts', 429);
  // Every request counts towards the limit, so this can't be used to spam someone's inbox.
  await recordFailure(c, bucket);
  const b = await body<{ email: string }>(c);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!validEmail(email)) return bad(c, 'invalid_email');

  const enabled = emailConfigured(c.env);
  let devLink: string | undefined;
  const row = await c.env.DB.prepare('SELECT id FROM parents WHERE email = ?').bind(email).first<{ id: string }>();
  if (row) {
    const token = randomToken();
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM password_resets WHERE parent_id = ? OR expires_at < ?').bind(row.id, Date.now()),
      c.env.DB.prepare('INSERT INTO password_resets (token_hash, parent_id, expires_at) VALUES (?, ?, ?)').bind(
        await sha256(token),
        row.id,
        Date.now() + RESET_MINUTES * 60_000,
      ),
    ]);
    const link = `${new URL(c.req.url).origin}/parent/reset?token=${token}`;
    await sendEmail(c.env, {
      to: email,
      subject: 'Reset your Times Tables password',
      text: `Someone asked to reset the password for this email on Times Tables.\n\nTo choose a new password, open this link within ${RESET_MINUTES} minutes:\n${link}\n\nIf it wasn't you, you can ignore this email.`,
    });
    if (devLinks(c)) devLink = link;
  }
  // The same answer whether or not the account exists.
  return c.json({ ok: true, emailEnabled: enabled, ...(devLink ? { devLink } : {}) });
});

app.post('/auth/reset', async (c) => {
  const b = await body<{ token: string; password: string }>(c);
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) return bad(c, 'weak_password');
  const tokenHash = await sha256(String(b.token ?? ''));
  const row = await c.env.DB.prepare('SELECT parent_id FROM password_resets WHERE token_hash = ? AND expires_at > ?')
    .bind(tokenHash, Date.now())
    .first<{ parent_id: string }>();
  if (!row) return bad(c, 'invalid_reset', 400);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE parents SET password_hash = ? WHERE id = ?').bind(await hashPassword(b.password), row.parent_id),
    // The link is single-use, and every other signed-in browser is signed out.
    c.env.DB.prepare('DELETE FROM password_resets WHERE parent_id = ?').bind(row.parent_id),
    c.env.DB.prepare('DELETE FROM sessions WHERE parent_id = ?').bind(row.parent_id),
  ]);
  await startSession(c, row.parent_id);
  const p = await c.env.DB.prepare('SELECT email FROM parents WHERE id = ?').bind(row.parent_id).first<{ email: string }>();
  return c.json({ email: p?.email });
});

app.use('/auth/account', requireParent);
/** Deletes the parent, their children, all practice data, linked phones and voice clips. */
app.delete('/auth/account', async (c) => {
  const b = await body<{ password: string }>(c);
  const row = await c.env.DB.prepare('SELECT password_hash FROM parents WHERE id = ?')
    .bind(c.get('parentId'))
    .first<{ password_hash: string }>();
  if (!row || typeof b.password !== 'string' || !(await verifyPassword(b.password, row.password_hash))) {
    return bad(c, 'invalid_login', 401);
  }
  await c.env.DB.prepare('DELETE FROM parents WHERE id = ?').bind(c.get('parentId')).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/api' });
  return c.json({ ok: true });
});

app.use('/auth/me', requireParent);
app.get('/auth/me', async (c) => {
  const row = await c.env.DB.prepare('SELECT email FROM parents WHERE id = ?').bind(c.get('parentId')).first<{ email: string }>();
  return c.json({ email: row?.email });
});

/* ---------------------------------------------------------------- learners (parent) */

app.use('/learners', requireParent);
app.use('/learners/*', requireParent);

async function ownLearner(c: Ctx): Promise<LearnerRow | null> {
  return c.env.DB.prepare('SELECT * FROM learners WHERE id = ? AND parent_id = ?')
    .bind(c.req.param('id'), c.get('parentId'))
    .first<LearnerRow>();
}

app.get('/learners', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT l.*,
       (SELECT COUNT(*) FROM devices d WHERE d.learner_id = l.id) AS device_count,
       (SELECT MAX(client_ts) FROM events e WHERE e.learner_id = l.id) AS last_ts
     FROM learners l WHERE l.parent_id = ? ORDER BY l.created_at`,
  )
    .bind(c.get('parentId'))
    .all<LearnerRow & { device_count: number; last_ts: number | null }>();
  const learners: LearnerSummaryDTO[] = results.map((r) => ({
    ...toLearner(r),
    deviceCount: r.device_count,
    lastActivityAt: r.last_ts,
  }));
  return c.json({ learners });
});

app.post('/learners', async (c) => {
  const b = await body<LearnerDTO>(c);
  const name = cleanName(b.displayName);
  if (!name) return bad(c, 'name_required');
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM learners WHERE parent_id = ?')
    .bind(c.get('parentId'))
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 10) return bad(c, 'too_many_learners');

  const row: LearnerRow = {
    id: crypto.randomUUID(),
    parent_id: c.get('parentId'),
    display_name: name,
    birth_year: typeof b.birthYear === 'number' ? Math.round(b.birthYear) : null,
    avatar: pick(b.avatar, AVATARS, AVATARS[0]),
    theme: pick(b.theme, THEMES, THEMES[0]),
    settings_json: JSON.stringify(cleanSettings(b.settings)),
  };
  await c.env.DB.prepare(
    'INSERT INTO learners (id, parent_id, display_name, birth_year, avatar, theme, settings_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(row.id, row.parent_id, row.display_name, row.birth_year, row.avatar, row.theme, row.settings_json, Date.now())
    .run();
  return c.json({ learner: toLearner(row) });
});

app.patch('/learners/:id', async (c) => {
  const row = await ownLearner(c);
  if (!row) return bad(c, 'not_found', 404);
  const b = await body<LearnerDTO>(c);
  const next: LearnerRow = {
    ...row,
    display_name: cleanName(b.displayName) ?? row.display_name,
    birth_year: b.birthYear === null ? null : typeof b.birthYear === 'number' ? Math.round(b.birthYear) : row.birth_year,
    avatar: pick(b.avatar, AVATARS, row.avatar),
    theme: pick(b.theme, THEMES, row.theme as (typeof THEMES)[number]),
    settings_json: b.settings ? JSON.stringify(cleanSettings(b.settings)) : row.settings_json,
  };
  await c.env.DB.prepare(
    'UPDATE learners SET display_name = ?, birth_year = ?, avatar = ?, theme = ?, settings_json = ? WHERE id = ?',
  )
    .bind(next.display_name, next.birth_year, next.avatar, next.theme, next.settings_json, row.id)
    .run();
  return c.json({ learner: toLearner(next) });
});

app.delete('/learners/:id', async (c) => {
  const row = await ownLearner(c);
  if (!row) return bad(c, 'not_found', 404);
  await c.env.DB.prepare('DELETE FROM learners WHERE id = ?').bind(row.id).run();
  return c.json({ ok: true });
});

app.post('/learners/:id/pairing-code', async (c) => {
  const row = await ownLearner(c);
  if (!row) return bad(c, 'not_found', 404);
  const expiresAt = Date.now() + PAIRING_MINUTES * 60_000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomDigits(6);
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM pairing_codes WHERE learner_id = ? OR expires_at < ?').bind(row.id, Date.now()),
        c.env.DB.prepare('INSERT INTO pairing_codes (code, learner_id, expires_at) VALUES (?, ?, ?)').bind(code, row.id, expiresAt),
      ]);
      return c.json({ code, expiresAt });
    } catch {
      /* code collision: try another */
    }
  }
  return c.json({ error: 'server_error' }, 500);
});

app.get('/learners/:id/devices', async (c) => {
  const row = await ownLearner(c);
  if (!row) return bad(c, 'not_found', 404);
  const { results } = await c.env.DB.prepare(
    'SELECT id, label, paired_at, last_seen_at FROM devices WHERE learner_id = ? ORDER BY paired_at',
  )
    .bind(row.id)
    .all<{ id: string; label: string | null; paired_at: number; last_seen_at: number | null }>();
  const devices: DeviceDTO[] = results.map((d) => ({ id: d.id, label: d.label, pairedAt: d.paired_at, lastSeenAt: d.last_seen_at }));
  return c.json({ devices });
});

app.delete('/learners/:id/devices/:deviceId', async (c) => {
  const row = await ownLearner(c);
  if (!row) return bad(c, 'not_found', 404);
  await c.env.DB.prepare('DELETE FROM devices WHERE id = ? AND learner_id = ?').bind(c.req.param('deviceId'), row.id).run();
  return c.json({ ok: true });
});

app.get('/learners/:id/events', async (c) => {
  const row = await ownLearner(c);
  if (!row) return bad(c, 'not_found', 404);
  return eventsPage(c, row.id);
});

/* ---------------------------------------------------------------- parent-recorded audio */

const MAX_CLIP_BYTES = 64 * 1024;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function listClips(c: Ctx, parentId: string) {
  const { results } = await c.env.DB.prepare('SELECT clip, updated_at FROM audio_clips WHERE parent_id = ? ORDER BY clip')
    .bind(parentId)
    .all<{ clip: string; updated_at: number }>();
  const clips: AudioClipDTO[] = results.map((r) => ({ clip: r.clip, updatedAt: r.updated_at }));
  return c.json({ clips });
}

async function sendClip(c: Ctx, parentId: string) {
  const row = await c.env.DB.prepare('SELECT mime, data_b64, updated_at FROM audio_clips WHERE parent_id = ? AND clip = ?')
    .bind(parentId, c.req.param('clip'))
    .first<{ mime: string; data_b64: string; updated_at: number }>();
  if (!row) return bad(c, 'not_found', 404);
  return new Response(fromBase64(row.data_b64), {
    headers: { 'content-type': row.mime, 'cache-control': 'private, max-age=0', 'x-updated-at': String(row.updated_at) },
  });
}

app.use('/audio', requireParent);
app.use('/audio/*', requireParent);

app.get('/audio', (c) => listClips(c, c.get('parentId')));
app.get('/audio/:clip', (c) => sendClip(c, c.get('parentId')));

app.put('/audio/:clip', async (c) => {
  const clip = c.req.param('clip');
  if (!ARABIC_CLIPS.includes(clip)) return bad(c, 'unknown_clip');
  const mime = (c.req.header('content-type') ?? '').split(';')[0].trim();
  if (!/^audio\/[\w.+-]+$/.test(mime)) return bad(c, 'not_audio');
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_CLIP_BYTES) return bad(c, 'too_big');
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO audio_clips (parent_id, clip, mime, data_b64, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (parent_id, clip) DO UPDATE SET mime = excluded.mime, data_b64 = excluded.data_b64, updated_at = excluded.updated_at`,
  )
    .bind(c.get('parentId'), clip, mime, toBase64(buf), now)
    .run();
  return c.json({ clip, updatedAt: now });
});

app.delete('/audio/:clip', async (c) => {
  await c.env.DB.prepare('DELETE FROM audio_clips WHERE parent_id = ? AND clip = ?').bind(c.get('parentId'), c.req.param('clip')).run();
  return c.json({ ok: true });
});

/** The parent whose voice a child's phone plays. */
async function parentOfLearner(c: Ctx): Promise<string | null> {
  const row = await c.env.DB.prepare('SELECT parent_id FROM learners WHERE id = ?').bind(c.get('learnerId')).first<{ parent_id: string }>();
  return row?.parent_id ?? null;
}

/* ---------------------------------------------------------------- devices (child phones) */

app.post('/pair', async (c) => {
  const bucket = `pair:${clientIp(c)}`;
  if (await tooManyFailures(c, bucket)) return bad(c, 'too_many_attempts', 429);
  const b = await body<{ code: string; label: string }>(c);
  const code = String(b.code ?? '').replace(/\D/g, '');
  const pairing = await c.env.DB.prepare('SELECT learner_id FROM pairing_codes WHERE code = ? AND expires_at > ?')
    .bind(code, Date.now())
    .first<{ learner_id: string }>();
  if (!pairing) {
    await recordFailure(c, bucket);
    return bad(c, 'invalid_code', 404);
  }
  const token = randomToken();
  const deviceId = crypto.randomUUID();
  const label = typeof b.label === 'string' ? b.label.slice(0, 60) : null;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO devices (id, learner_id, token_hash, label, paired_at) VALUES (?, ?, ?, ?, ?)').bind(
      deviceId,
      pairing.learner_id,
      await sha256(token),
      label,
      Date.now(),
    ),
    c.env.DB.prepare('DELETE FROM pairing_codes WHERE code = ?').bind(code),
  ]);
  const learner = await c.env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(pairing.learner_id).first<LearnerRow>();
  return c.json({ token, learner: toLearner(learner!) });
});

async function requireDevice(c: Ctx, next: Next) {
  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return bad(c, 'not_paired', 401);
  const row = await c.env.DB.prepare('SELECT id, learner_id, last_seen_at FROM devices WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ id: string; learner_id: string; last_seen_at: number | null }>();
  if (!row) return bad(c, 'not_paired', 401);
  c.set('deviceId', row.id);
  c.set('learnerId', row.learner_id);
  if (!row.last_seen_at || Date.now() - row.last_seen_at > 60_000) {
    await c.env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(Date.now(), row.id).run();
  }
  await next();
}

app.use('/device/*', requireDevice);

app.get('/device/me', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(c.get('learnerId')).first<LearnerRow>();
  if (!row) return bad(c, 'not_paired', 401);
  return c.json({ learner: toLearner(row) });
});

/** Learners may change their own look; everything else is the parent's call. */
app.patch('/device/me', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(c.get('learnerId')).first<LearnerRow>();
  if (!row) return bad(c, 'not_paired', 401);
  const b = await body<LearnerDTO>(c);
  const avatar = pick(b.avatar, AVATARS, row.avatar);
  const theme = pick(b.theme, THEMES, row.theme as (typeof THEMES)[number]);
  await c.env.DB.prepare('UPDATE learners SET avatar = ?, theme = ? WHERE id = ?').bind(avatar, theme, row.id).run();
  return c.json({ learner: toLearner({ ...row, avatar, theme }) });
});

app.post('/device/events', async (c) => {
  const b = await body<{ events: unknown[] }>(c);
  if (!Array.isArray(b.events)) return bad(c, 'events_required');
  if (b.events.length > MAX_EVENTS_PER_SYNC) return bad(c, 'too_many_events');

  const learnerId = c.get('learnerId');
  const deviceId = c.get('deviceId');
  const now = Date.now();
  const accepted: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  const insert = c.env.DB.prepare(
    'INSERT OR IGNORE INTO events (id, learner_id, device_id, type, payload_json, client_ts, server_ts) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  for (const raw of b.events) {
    const e = raw as { id?: unknown; type?: unknown; ts?: unknown; payload?: unknown };
    if (typeof e.id !== 'string' || e.id.length > 64) continue;
    if (!EVENT_TYPES.includes(e.type as (typeof EVENT_TYPES)[number])) continue;
    if (typeof e.ts !== 'number' || !Number.isFinite(e.ts)) continue;
    const payload = JSON.stringify(e.payload ?? {});
    if (payload.length > MAX_PAYLOAD_BYTES) continue;
    stmts.push(insert.bind(e.id, learnerId, deviceId, e.type as string, payload, Math.round(e.ts), now));
    accepted.push(e.id);
  }
  // D1 batches are transactional; keep them modest.
  for (let i = 0; i < stmts.length; i += 100) await c.env.DB.batch(stmts.slice(i, i + 100));
  return c.json({ accepted });
});

app.get('/device/events', (c) => eventsPage(c, c.get('learnerId')));

app.get('/device/audio', async (c) => {
  const parentId = await parentOfLearner(c);
  return parentId ? listClips(c, parentId) : bad(c, 'not_paired', 401);
});
app.get('/device/audio/:clip', async (c) => {
  const parentId = await parentOfLearner(c);
  return parentId ? sendClip(c, parentId) : bad(c, 'not_paired', 401);
});

app.all('*', (c) => bad(c, 'not_found', 404));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
