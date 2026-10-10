import { Hono, type Context, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  AVATARS,
  EVENT_TYPES,
  THEMES,
  type DeviceDTO,
  type LearnerDTO,
  type LearnerSummaryDTO,
  type PasskeyDTO,
} from '../src/shared/api';
import { b64url, fromB64url, hashPassword, randomDigits, randomToken, sha256, verifyPassword } from './crypto';
import { emailConfigured, sendEmail, type EmailEnv } from './email';

interface Env extends EmailEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Cloudflare Turnstile. Without the secret, the bot check is skipped (local development). */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  /** Passkeys: the site's domain and the origins allowed to use it. Default: the request's own. */
  RP_ID?: string;
  ORIGINS?: string;
  /**
   * Development only (.dev.vars): the browser tests sign up more parents and children than one
   * network may in an hour. Ignored over https, so it can never loosen the live site.
   */
  DEV_NO_SIGNUP_LIMITS?: string;
}

interface Vars {
  parentId: string;
  sessionHash: string;
  deviceId: string;
  deviceToken: string;
  learnerId: string;
}

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const SESSION_COOKIE = 'tt_session';
const SESSION_DAYS = 60;
/** A copy of the phone's child token, so the child comes back if the browser wipes its storage. */
const DEVICE_COOKIE = 'ashra_device';
const DEVICE_COOKIE_DAYS = 400; // the longest browsers allow
/** On a phone shared with a child, the parent area locks after this long without use. */
const UNLOCK_MS = 10 * MINUTE;
const CODE_MINUTES = 15;
const CHALLENGE_MS = 5 * MINUTE;
const FAILURE_WINDOW_MS = 15 * MINUTE;
const MAX_FAILURES = 10;
/** New children: per network (a school class shares one), and across the whole site per day. */
const STARTS_PER_IP_HOUR = 20;
const STARTS_PER_DAY = 300;
const SIGNUPS_PER_IP_HOUR = 10;
/** Children starting where the bot check couldn't run at all. */
const UNCHECKED_STARTS_PER_IP_HOUR = 3;
const UNCHECKED_STARTS_PER_DAY = 50;
const MAX_EVENTS_PER_SYNC = 500;
const MAX_EVENTS_PER_DAY = 5000;
const MAX_PAYLOAD_BYTES = 2000;
const EVENTS_PAGE = 5000;
const MAX_LEARNERS = 10;
/** Children nobody connected: removed after a week if they never practised, or a year of silence. */
const UNCLAIMED_UNUSED_MS = 7 * DAY;
const UNCLAIMED_IDLE_MS = 365 * DAY;

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

function secure(c: Ctx): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

/** True when `bucket` has had `max` hits within the window (failed logins, sign-ups, …). */
async function limited(c: Ctx, bucket: string, max = MAX_FAILURES, windowMs = FAILURE_WINDOW_MS): Promise<boolean> {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM failures WHERE bucket = ? AND ts > ?')
    .bind(bucket, Date.now() - windowMs)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= max;
}

async function hit(c: Ctx, ...buckets: string[]) {
  const now = Date.now();
  await c.env.DB.batch([
    ...buckets.map((b) => c.env.DB.prepare('INSERT INTO failures (bucket, ts) VALUES (?, ?)').bind(b, now)),
    c.env.DB.prepare('DELETE FROM failures WHERE ts < ?').bind(now - DAY),
  ]);
}

/** The per-network and daily limits on creating accounts and children. */
async function signupLimited(c: Ctx, buckets: [string, number, number][]): Promise<boolean> {
  if (c.env.DEV_NO_SIGNUP_LIMITS === '1' && !secure(c)) return false;
  for (const [bucket, max, windowMs] of buckets) if (await limited(c, bucket, max, windowMs)) return true;
  return false;
}

/** Cloudflare Turnstile: shows at most a checkbox, never a puzzle. */
async function human(c: Ctx, token: unknown): Promise<boolean> {
  if (!c.env.TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || !token) return false;
  const form = new FormData();
  form.append('secret', c.env.TURNSTILE_SECRET);
  form.append('response', token);
  form.append('remoteip', clientIp(c));
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

interface LearnerRow {
  id: string;
  parent_id: string | null;
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
  return {
    id: r.id,
    displayName: r.display_name,
    birthYear: r.birth_year,
    avatar: r.avatar,
    theme: r.theme,
    settings,
    connected: r.parent_id !== null,
  };
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

function deviceLabel(v: unknown): string | null {
  return typeof v === 'string' ? v.slice(0, 60) : null;
}

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

/** A one-time 6-digit code for a learner. 'parent' codes link a phone; 'child' codes also connect a parent. */
async function issueCode(c: Ctx, learnerId: string, kind: 'parent' | 'child') {
  const expiresAt = Date.now() + CODE_MINUTES * MINUTE;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomDigits(6);
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM pairing_codes WHERE (learner_id = ? AND kind = ?) OR expires_at < ?').bind(
          learnerId,
          kind,
          Date.now(),
        ),
        c.env.DB.prepare('INSERT INTO pairing_codes (code, learner_id, expires_at, kind) VALUES (?, ?, ?, ?)').bind(
          code,
          learnerId,
          expiresAt,
          kind,
        ),
      ]);
      return c.json({ code, expiresAt });
    } catch {
      /* code collision: try another */
    }
  }
  return c.json({ error: 'server_error' }, 500);
}

/* ---------------------------------------------------------------- phones */

function setDeviceCookie(c: Ctx, token: string) {
  setCookie(c, DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: secure(c),
    sameSite: 'Lax',
    path: '/api',
    maxAge: DEVICE_COOKIE_DAYS * 86400,
  });
}

/** The parent signed in on this browser now shares the phone with a child: lock their area when idle. */
async function markSessionShared(c: Ctx) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('UPDATE sessions SET shared = 1 WHERE token_hash = ?').bind(await sha256(token)).run();
}

/** Links this browser to a learner: returns the token the app keeps, and keeps a copy in a cookie. */
async function newDevice(c: Ctx, learnerId: string, label: string | null): Promise<string> {
  const token = randomToken();
  await c.env.DB.prepare('INSERT INTO devices (id, learner_id, token_hash, label, paired_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), learnerId, await sha256(token), label, Date.now())
    .run();
  setDeviceCookie(c, token);
  await markSessionShared(c);
  return token;
}

/* ---------------------------------------------------------------- config */

app.get('/config', (c) =>
  c.json({
    turnstileSiteKey: c.env.TURNSTILE_SECRET ? (c.env.TURNSTILE_SITE_KEY ?? null) : null,
    emailEnabled: emailConfigured(c.env),
  }),
);

/* ---------------------------------------------------------------- a child starts alone */

/** No sign-in and nothing personal: an avatar, a colour and settings picked from the child's age. */
app.post('/start', async (c) => {
  const ipBucket = `start:${clientIp(c)}`;
  if (await signupLimited(c, [[ipBucket, STARTS_PER_IP_HOUR, HOUR], ['start', STARTS_PER_DAY, DAY]]))
    return bad(c, 'too_many_attempts', 429);
  const b = await body<LearnerDTO & { turnstileToken: string; label: string }>(c);
  // A filtered network (school, family filter) can block the bot check itself. A child there
  // still gets in, but such starts are few per network and per day, so a script gains little.
  const unchecked = !!c.env.TURNSTILE_SECRET && !b.turnstileToken;
  const uncheckedIp = `start-unchecked:${clientIp(c)}`;
  if (unchecked) {
    if (await signupLimited(c, [[uncheckedIp, UNCHECKED_STARTS_PER_IP_HOUR, HOUR], ['start-unchecked', UNCHECKED_STARTS_PER_DAY, DAY]]))
      return bad(c, 'too_many_attempts', 429);
  } else if (!(await human(c, b.turnstileToken))) return bad(c, 'not_human', 403);
  await hit(c, ipBucket, 'start', ...(unchecked ? [uncheckedIp, 'start-unchecked'] : []));

  const row: LearnerRow = {
    id: crypto.randomUUID(),
    parent_id: null,
    display_name: '',
    birth_year: null,
    avatar: pick(b.avatar, AVATARS, AVATARS[0]),
    theme: pick(b.theme, THEMES, THEMES[0]),
    settings_json: JSON.stringify(cleanSettings(b.settings)),
  };
  await c.env.DB.prepare(
    'INSERT INTO learners (id, parent_id, display_name, birth_year, avatar, theme, settings_json, created_at) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?)',
  )
    .bind(row.id, row.display_name, row.avatar, row.theme, row.settings_json, Date.now())
    .run();
  const token = await newDevice(c, row.id, deviceLabel(b.label));
  return c.json({ token, learner: toLearner(row) });
});

/** The browser lost its storage (Safari clears it after 7 days away): bring the child back from the cookie. */
app.post('/restore', async (c) => {
  const token = getCookie(c, DEVICE_COOKIE);
  const row = token
    ? await c.env.DB.prepare('SELECT l.* FROM devices d JOIN learners l ON l.id = d.learner_id WHERE d.token_hash = ?')
        .bind(await sha256(token))
        .first<LearnerRow>()
    : null;
  if (!token || !row) {
    deleteCookie(c, DEVICE_COOKIE, { path: '/api' });
    return bad(c, 'not_paired', 404);
  }
  setDeviceCookie(c, token);
  return c.json({ token, learner: toLearner(row) });
});

/* ---------------------------------------------------------------- parent auth */

async function startSession(c: Ctx, parentId: string) {
  const token = randomToken();
  const now = Date.now();
  // Signing in on a phone that already holds a child's practice: this parent area locks when idle.
  const childToken = getCookie(c, DEVICE_COOKIE);
  const shared = childToken
    ? !!(await c.env.DB.prepare('SELECT 1 FROM devices WHERE token_hash = ?').bind(await sha256(childToken)).first())
    : false;
  await c.env.DB.prepare(
    'INSERT INTO sessions (token_hash, parent_id, expires_at, shared, unlocked_until) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await sha256(token), parentId, now + SESSION_DAYS * DAY, shared ? 1 : 0, now + UNLOCK_MS)
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(c),
    sameSite: 'Lax',
    path: '/api',
    maxAge: SESSION_DAYS * 86400,
  });
}

function validEmail(e: unknown): e is string {
  return typeof e === 'string' && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

app.post('/auth/signup', async (c) => {
  const b = await body<{ email: string; password: string; turnstileToken: string }>(c);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!validEmail(email)) return bad(c, 'invalid_email');
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) return bad(c, 'weak_password');
  const bucket = `signup:${clientIp(c)}`;
  if (await signupLimited(c, [[bucket, SIGNUPS_PER_IP_HOUR, HOUR]])) return bad(c, 'too_many_attempts', 429);
  if (!(await human(c, b.turnstileToken))) return bad(c, 'not_human', 403);
  await hit(c, bucket);

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
  if (await limited(c, bucket)) return bad(c, 'too_many_attempts', 429);

  const row = await c.env.DB.prepare('SELECT id, password_hash FROM parents WHERE email = ?')
    .bind(email)
    .first<{ id: string; password_hash: string }>();
  if (!row || typeof b.password !== 'string' || !(await verifyPassword(b.password, row.password_hash))) {
    await hit(c, bucket);
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

interface SessionRow {
  parent_id: string;
  shared: number;
  unlocked_until: number;
  hash: string;
}

async function currentSession(c: Ctx): Promise<SessionRow | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await c.env.DB.prepare('SELECT parent_id, shared, unlocked_until FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(hash, Date.now())
    .first<Omit<SessionRow, 'hash'>>();
  return row ? { ...row, hash } : null;
}

const isLocked = (s: SessionRow) => s.shared === 1 && s.unlocked_until < Date.now();

async function requireParent(c: Ctx, next: Next) {
  const s = await currentSession(c);
  if (!s) return bad(c, 'not_signed_in', 401);
  if (isLocked(s)) return bad(c, 'locked', 403);
  // Use keeps a shared phone's parent area open.
  if (s.shared === 1 && s.unlocked_until - Date.now() < UNLOCK_MS / 2) {
    await c.env.DB.prepare('UPDATE sessions SET unlocked_until = ? WHERE token_hash = ?').bind(Date.now() + UNLOCK_MS, s.hash).run();
  }
  c.set('parentId', s.parent_id);
  c.set('sessionHash', s.hash);
  await next();
}

app.get('/auth/me', async (c) => {
  const s = await currentSession(c);
  if (!s) return bad(c, 'not_signed_in', 401);
  const row = await c.env.DB.prepare('SELECT email FROM parents WHERE id = ?').bind(s.parent_id).first<{ email: string }>();
  return c.json({ email: row?.email, shared: s.shared === 1, locked: isLocked(s) });
});

/** A phone shared with a child: the parent area opens again with the password (not the phone's lock, which the child may know). */
app.post('/auth/unlock', async (c) => {
  const s = await currentSession(c);
  if (!s) return bad(c, 'not_signed_in', 401);
  const bucket = `unlock:${s.parent_id}`;
  if (await limited(c, bucket)) return bad(c, 'too_many_attempts', 429);
  const b = await body<{ password: string }>(c);
  const row = await c.env.DB.prepare('SELECT password_hash FROM parents WHERE id = ?').bind(s.parent_id).first<{ password_hash: string }>();
  if (!row || typeof b.password !== 'string' || !(await verifyPassword(b.password, row.password_hash))) {
    await hit(c, bucket);
    return bad(c, 'invalid_login', 401);
  }
  await c.env.DB.prepare('UPDATE sessions SET unlocked_until = ? WHERE token_hash = ?').bind(Date.now() + UNLOCK_MS, s.hash).run();
  return c.json({ ok: true });
});

/** Hand the phone back to the child: the parent area locks now. */
app.post('/auth/lock', async (c) => {
  const s = await currentSession(c);
  if (s) await c.env.DB.prepare('UPDATE sessions SET unlocked_until = 0, shared = 1 WHERE token_hash = ?').bind(s.hash).run();
  return c.json({ ok: true });
});

/* ---------------------------------------------------------------- passkeys (parents) */

function rpId(c: Ctx): string {
  return c.env.RP_ID ?? new URL(c.req.url).hostname;
}

function origins(c: Ctx): string[] {
  return c.env.ORIGINS ? c.env.ORIGINS.split(',').map((o) => o.trim()) : [new URL(c.req.url).origin];
}

async function saveChallenge(c: Ctx, challenge: string, parentId: string | null): Promise<string> {
  const id = randomToken(16);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').bind(Date.now()),
    c.env.DB.prepare('INSERT INTO webauthn_challenges (id, challenge, parent_id, expires_at) VALUES (?, ?, ?, ?)').bind(
      id,
      challenge,
      parentId,
      Date.now() + CHALLENGE_MS,
    ),
  ]);
  return id;
}

/** Each challenge works once. */
async function takeChallenge(c: Ctx, id: unknown): Promise<{ challenge: string; parent_id: string | null } | null> {
  if (typeof id !== 'string') return null;
  const row = await c.env.DB.prepare('SELECT challenge, parent_id FROM webauthn_challenges WHERE id = ? AND expires_at > ?')
    .bind(id, Date.now())
    .first<{ challenge: string; parent_id: string | null }>();
  await c.env.DB.prepare('DELETE FROM webauthn_challenges WHERE id = ?').bind(id).run();
  return row;
}

app.post('/auth/passkey/register-options', requireParent, async (c) => {
  const parentId = c.get('parentId');
  const parent = await c.env.DB.prepare('SELECT email FROM parents WHERE id = ?').bind(parentId).first<{ email: string }>();
  const { results } = await c.env.DB.prepare('SELECT id, transports FROM passkeys WHERE parent_id = ?')
    .bind(parentId)
    .all<{ id: string; transports: string | null }>();
  const options = await generateRegistrationOptions({
    rpName: 'Ashra',
    rpID: rpId(c),
    userName: parent?.email ?? 'parent',
    userID: Uint8Array.from(new TextEncoder().encode(parentId)),
    attestationType: 'none',
    excludeCredentials: results.map((p) => ({ id: p.id, transports: p.transports ? JSON.parse(p.transports) : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  return c.json({ options, challengeId: await saveChallenge(c, options.challenge, parentId) });
});

app.post('/auth/passkey/register', requireParent, async (c) => {
  const b = await body<{ challengeId: string; response: RegistrationResponseJSON; label: string }>(c);
  const ch = await takeChallenge(c, b.challengeId);
  if (!ch || ch.parent_id !== c.get('parentId') || !b.response) return bad(c, 'passkey_failed');
  let info;
  try {
    const v = await verifyRegistrationResponse({
      response: b.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origins(c),
      expectedRPID: rpId(c),
      requireUserVerification: false,
    });
    if (!v.verified) return bad(c, 'passkey_failed');
    info = v.registrationInfo;
  } catch {
    return bad(c, 'passkey_failed');
  }
  const { credential } = info;
  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO passkeys (id, parent_id, public_key, counter, transports, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      credential.id,
      c.get('parentId'),
      b64url(credential.publicKey),
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
      deviceLabel(b.label),
      Date.now(),
    )
    .run();
  return c.json({ ok: true });
});

app.get('/auth/passkeys', requireParent, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, label, created_at, last_used_at FROM passkeys WHERE parent_id = ? ORDER BY created_at',
  )
    .bind(c.get('parentId'))
    .all<{ id: string; label: string | null; created_at: number; last_used_at: number | null }>();
  const passkeys: PasskeyDTO[] = results.map((p) => ({ id: p.id, label: p.label, createdAt: p.created_at, lastUsedAt: p.last_used_at }));
  return c.json({ passkeys });
});

app.delete('/auth/passkeys/:id', requireParent, async (c) => {
  await c.env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND parent_id = ?').bind(c.req.param('id'), c.get('parentId')).run();
  return c.json({ ok: true });
});

app.post('/auth/passkey/login-options', async (c) => {
  const bucket = `login:${clientIp(c)}`;
  if (await limited(c, bucket)) return bad(c, 'too_many_attempts', 429);
  // No list of credentials: the phone offers whichever passkey it holds for this site.
  const options = await generateAuthenticationOptions({ rpID: rpId(c), userVerification: 'preferred' });
  return c.json({ options, challengeId: await saveChallenge(c, options.challenge, null) });
});

app.post('/auth/passkey/login', async (c) => {
  const bucket = `login:${clientIp(c)}`;
  if (await limited(c, bucket)) return bad(c, 'too_many_attempts', 429);
  const b = await body<{ challengeId: string; response: AuthenticationResponseJSON }>(c);
  const ch = await takeChallenge(c, b.challengeId);
  const key =
    ch && b.response?.id
      ? await c.env.DB.prepare('SELECT id, parent_id, public_key, counter, transports FROM passkeys WHERE id = ?')
          .bind(b.response.id)
          .first<{ id: string; parent_id: string; public_key: string; counter: number; transports: string | null }>()
      : null;
  let verified = false;
  let newCounter = 0;
  if (ch && key) {
    try {
      const v = await verifyAuthenticationResponse({
        response: b.response!,
        expectedChallenge: ch.challenge,
        expectedOrigin: origins(c),
        expectedRPID: rpId(c),
        credential: {
          id: key.id,
          publicKey: fromB64url(key.public_key),
          counter: key.counter,
          transports: key.transports ? JSON.parse(key.transports) : undefined,
        },
        requireUserVerification: false,
      });
      verified = v.verified;
      newCounter = v.authenticationInfo.newCounter;
    } catch {
      verified = false;
    }
  }
  if (!verified || !key) {
    await hit(c, bucket);
    return bad(c, 'passkey_failed', 401);
  }
  await c.env.DB.prepare('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?').bind(newCounter, Date.now(), key.id).run();
  await startSession(c, key.parent_id);
  const p = await c.env.DB.prepare('SELECT email FROM parents WHERE id = ?').bind(key.parent_id).first<{ email: string }>();
  return c.json({ email: p?.email });
});

/* ---------------------------------------------------------------- password reset & account deletion */

const RESET_MINUTES = 60;
/**
 * Email costs nothing within the account's 3,000 a month (shared with any other app on the
 * account). These caps keep Ashra to half of that, and stop anyone flooding one inbox.
 */
const EMAILS_PER_ADDRESS_HOUR = 3;
const EMAILS_PER_DAY = 50;

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
  if (await limited(c, bucket)) return bad(c, 'too_many_attempts', 429);
  const b = await body<{ email: string; turnstileToken: string }>(c);
  if (!(await human(c, b.turnstileToken))) return bad(c, 'not_human', 403);
  // Every request counts towards the limit, so this can't be used to spam someone's inbox.
  await hit(c, bucket);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!validEmail(email)) return bad(c, 'invalid_email');

  const enabled = emailConfigured(c.env);
  let devLink: string | undefined;
  const row = await c.env.DB.prepare('SELECT id FROM parents WHERE email = ?').bind(email).first<{ id: string }>();
  // Hashed: the limits table shouldn't hold email addresses.
  const addressBucket = `email:${await sha256(email)}`;
  const capped =
    enabled && ((await limited(c, addressBucket, EMAILS_PER_ADDRESS_HOUR, HOUR)) || (await limited(c, 'email', EMAILS_PER_DAY, DAY)));
  // Over a cap, nothing is sent but the answer looks the same.
  if (row && !capped) {
    if (enabled) await hit(c, addressBucket, 'email');
    const token = randomToken();
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM password_resets WHERE parent_id = ? OR expires_at < ?').bind(row.id, Date.now()),
      c.env.DB.prepare('INSERT INTO password_resets (token_hash, parent_id, expires_at) VALUES (?, ?, ?)').bind(
        await sha256(token),
        row.id,
        Date.now() + RESET_MINUTES * MINUTE,
      ),
    ]);
    const link = `${new URL(c.req.url).origin}/parent/reset?token=${token}`;
    await sendEmail(c.env, {
      to: email,
      subject: 'Reset your Ashra password · إعادة تعيين كلمة مرور عشرة',
      text:
        `Someone asked to reset the password for this email on Ashra.\n\nTo choose a new password, open this link within ${RESET_MINUTES} minutes:\n${link}\n\nIf it wasn't you, you can ignore this email.\n\n— — —\n\n` +
        `طلب أحدهم إعادة تعيين كلمة المرور لهذا البريد في عشرة.\n\nلاختيار كلمة مرور جديدة، افتح هذا الرابط خلال ${RESET_MINUTES} دقيقة:\n${link}\n\nإن لم تكن أنت، يمكنك تجاهل هذه الرسالة.`,
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

/** Deletes the parent, their children, all practice data, linked phones and passkeys. */
app.delete('/auth/account', requireParent, async (c) => {
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

/* ---------------------------------------------------------------- learners (parent) */

app.use('/learners', requireParent);
app.use('/learners/*', requireParent);

async function ownLearner(c: Ctx): Promise<LearnerRow | null> {
  return c.env.DB.prepare('SELECT * FROM learners WHERE id = ? AND parent_id = ?')
    .bind(c.req.param('id'), c.get('parentId'))
    .first<LearnerRow>();
}

async function learnerCount(c: Ctx): Promise<number> {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM learners WHERE parent_id = ?')
    .bind(c.get('parentId'))
    .first<{ n: number }>();
  return row?.n ?? 0;
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
  if ((await learnerCount(c)) >= MAX_LEARNERS) return bad(c, 'too_many_learners');

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

/**
 * Connects a child who started alone: by the code on their phone, or (signed in on the
 * child's own phone) by that phone's token. A child connected to someone else stays theirs.
 */
app.post('/learners/claim', async (c) => {
  const bucket = `claim:${clientIp(c)}`;
  if (await limited(c, bucket)) return bad(c, 'too_many_attempts', 429);
  const b = await body<{ code: string; displayName: string }>(c);
  let learnerId: string | null = null;
  let code: string | null = null;
  if (b.code !== undefined) {
    code = String(b.code).replace(/\D/g, '');
    const row = await c.env.DB.prepare("SELECT learner_id FROM pairing_codes WHERE code = ? AND kind = 'child' AND expires_at > ?")
      .bind(code, Date.now())
      .first<{ learner_id: string }>();
    learnerId = row?.learner_id ?? null;
  } else {
    const auth = c.req.header('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const row = token
      ? await c.env.DB.prepare('SELECT learner_id FROM devices WHERE token_hash = ?').bind(await sha256(token)).first<{ learner_id: string }>()
      : null;
    learnerId = row?.learner_id ?? null;
  }
  if (!learnerId) {
    await hit(c, bucket);
    return bad(c, 'invalid_code', 404);
  }
  const learner = await c.env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(learnerId).first<LearnerRow>();
  if (!learner) return bad(c, 'invalid_code', 404);
  if (learner.parent_id && learner.parent_id !== c.get('parentId')) return bad(c, 'already_connected', 409);
  if (!learner.parent_id && (await learnerCount(c)) >= MAX_LEARNERS) return bad(c, 'too_many_learners');

  const name = cleanName(b.displayName) ?? learner.display_name;
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE learners SET parent_id = ?, display_name = ? WHERE id = ?').bind(c.get('parentId'), name, learnerId),
    ...(code ? [c.env.DB.prepare('DELETE FROM pairing_codes WHERE code = ?').bind(code)] : []),
  ]);
  return c.json({ learner: toLearner({ ...learner, parent_id: c.get('parentId'), display_name: name }) });
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
  return issueCode(c, row.id, 'parent');
});

/** The child will practise on this same phone, the parent's. */
app.post('/learners/:id/this-phone', async (c) => {
  const row = await ownLearner(c);
  if (!row) return bad(c, 'not_found', 404);
  const b = await body<{ label: string }>(c);
  const token = await newDevice(c, row.id, deviceLabel(b.label));
  return c.json({ token, learner: toLearner(row) });
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

/* ---------------------------------------------------------------- devices (child phones) */

/** A code from a parent, or from the child's other phone: this phone joins the same child. */
app.post('/pair', async (c) => {
  const bucket = `pair:${clientIp(c)}`;
  if (await limited(c, bucket)) return bad(c, 'too_many_attempts', 429);
  const b = await body<{ code: string; label: string }>(c);
  const code = String(b.code ?? '').replace(/\D/g, '');
  const pairing = await c.env.DB.prepare('SELECT learner_id FROM pairing_codes WHERE code = ? AND expires_at > ?')
    .bind(code, Date.now())
    .first<{ learner_id: string }>();
  if (!pairing) {
    await hit(c, bucket);
    return bad(c, 'invalid_code', 404);
  }
  await c.env.DB.prepare('DELETE FROM pairing_codes WHERE code = ?').bind(code).run();
  const token = await newDevice(c, pairing.learner_id, deviceLabel(b.label));
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
  c.set('deviceToken', token);
  c.set('learnerId', row.learner_id);
  if (!row.last_seen_at || Date.now() - row.last_seen_at > MINUTE) {
    await c.env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(Date.now(), row.id).run();
  }
  await next();
}

app.use('/device/*', requireDevice);

app.get('/device/me', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(c.get('learnerId')).first<LearnerRow>();
  if (!row) return bad(c, 'not_paired', 401);
  // Keep the backup cookie fresh (and set it on phones linked before it existed).
  setDeviceCookie(c, c.get('deviceToken'));
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

/** "Show my code": for the child's next phone, or for a grown-up to connect. */
app.post('/device/code', (c) => issueCode(c, c.get('learnerId'), 'child'));

app.post('/device/events', async (c) => {
  const b = await body<{ events: unknown[] }>(c);
  if (!Array.isArray(b.events)) return bad(c, 'events_required');
  if (b.events.length > MAX_EVENTS_PER_SYNC) return bad(c, 'too_many_events');

  const learnerId = c.get('learnerId');
  const deviceId = c.get('deviceId');
  const now = Date.now();
  // Far more than a day of real practice: anything above it is a script, so it waits (the app retries later).
  const today = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE learner_id = ? AND server_ts > ?')
    .bind(learnerId, now - DAY)
    .first<{ n: number }>();
  if ((today?.n ?? 0) + b.events.length > MAX_EVENTS_PER_DAY) return bad(c, 'too_many_events', 429);

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
  if (stmts.length) stmts.push(c.env.DB.prepare('UPDATE learners SET last_active_at = ? WHERE id = ?').bind(now, learnerId));
  // D1 batches are transactional; keep them modest.
  for (let i = 0; i < stmts.length; i += 100) await c.env.DB.batch(stmts.slice(i, i + 100));
  return c.json({ accepted });
});

app.get('/device/events', (c) => eventsPage(c, c.get('learnerId')));

app.all('*', (c) => bad(c, 'not_found', 404));

/** Nightly: the retention promised on /privacy, and expired sign-in leftovers. */
async function cleanUp(env: Env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM learners WHERE parent_id IS NULL AND last_active_at IS NULL AND created_at < ?').bind(
      now - UNCLAIMED_UNUSED_MS,
    ),
    env.DB.prepare('DELETE FROM learners WHERE parent_id IS NULL AND last_active_at < ?').bind(now - UNCLAIMED_IDLE_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM password_resets WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM failures WHERE ts < ?').bind(now - DAY),
  ]);
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await cleanUp(env);
  },
} satisfies ExportedHandler<Env>;
