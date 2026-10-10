// End-to-end check of the API against a running server.
// Usage: node scripts/smoke-api.mjs [baseUrl]
// Against the live site, the bot check refuses scripted sign-ups: run it locally.
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';

/** The browser's cookies, as one Cookie header ("a=1; b=2"). Save and restore it to switch browsers. */
let cookie = '';
let failures = 0;

function mergeCookies(jar, setCookies) {
  const all = new Map(jar ? jar.split('; ').map((p) => [p.split('=')[0], p]) : []);
  for (const sc of setCookies) {
    const pair = sc.split(';')[0];
    const name = pair.split('=')[0];
    if (pair.endsWith('=') || /max-age=0/i.test(sc)) all.delete(name);
    else all.set(name, pair);
  }
  return [...all.values()].join('; ');
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  cookie = mergeCookies(cookie, res.headers.getSetCookie());
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

function check(name, cond, extra) {
  if (cond) console.log('  ok  ', name);
  else {
    failures++;
    console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

const email = `parent+${Date.now()}@example.com`;

let r = await call('POST', '/api/auth/signup', { email, password: 'short' });
check('rejects weak password', r.status === 400 && r.data.error === 'weak_password', r);
r = await call('POST', '/api/auth/signup', { email, password: 'correct horse' });
check('signs up', r.status === 200 && r.data.email === email, r);
r = await call('GET', '/api/auth/me');
check('session cookie works', r.status === 200 && r.data.email === email, r);

r = await call('POST', '/api/learners', { displayName: 'Test Kid', avatar: '🦊', theme: 'violet', settings: { range: 10, bogus: 1 } });
check('creates learner', r.status === 200 && r.data.learner.displayName === 'Test Kid', r);
check('drops unknown settings', r.data.learner.settings.bogus === undefined && r.data.learner.settings.range === 10, r.data);
const learnerId = r.data.learner.id;

r = await call('PATCH', `/api/learners/${learnerId}`, { settings: { range: 12, profile: 'young' } });
check('updates settings', r.data.learner.settings.range === 12, r);

r = await call('POST', `/api/learners/${learnerId}/pairing-code`);
check('issues pairing code', /^\d{6}$/.test(r.data.code), r);
const code = r.data.code;

const parentCookie = cookie;
cookie = '';
r = await call('POST', '/api/pair', { code: '000000' });
check('rejects bad code', r.status === 404, r);
r = await call('POST', '/api/pair', { code, label: 'smoke test phone' });
check('pairs device', r.status === 200 && r.data.token && r.data.learner.id === learnerId, r);
const auth = { authorization: `Bearer ${r.data.token}` };
r = await call('POST', '/api/pair', { code });
check('pairing code is single-use', r.status === 404, r);

r = await call('GET', '/api/device/me', null, auth);
check('device sees learner', r.data.learner.id === learnerId, r);
r = await call('PATCH', '/api/device/me', { avatar: '🐼', displayName: 'Hacked' }, auth);
check('device can change avatar only', r.data.learner.avatar === '🐼' && r.data.learner.displayName === 'Test Kid', r);

const now = Date.now();
const events = [
  { id: `e-${now}-1`, type: 'session_start', ts: now, payload: { sessionId: 's1', kind: 'practice' } },
  { id: `e-${now}-2`, type: 'answer', ts: now + 1, payload: { a: 6, b: 7, given: 42, correct: true, latencyMs: 2100, mode: 'practice', hinted: false, sessionId: 's1' } },
  { id: `e-${now}-3`, type: 'bogus', ts: now + 2, payload: {} },
];
r = await call('POST', '/api/device/events', { events }, auth);
check('accepts valid events, drops invalid', r.data.accepted.length === 2, r);
r = await call('POST', '/api/device/events', { events }, auth);
check('re-sending is harmless', r.status === 200, r);
r = await call('GET', '/api/device/events?since=0', null, auth);
check('device pulls events without duplicates', r.data.events.length === 2, r);
const lastSeq = r.data.lastSeq;
r = await call('GET', `/api/device/events?since=${lastSeq}`, null, auth);
check('incremental pull is empty', r.data.events.length === 0, r);

r = await call('GET', '/api/device/me', null, { authorization: 'Bearer nope' });
check('rejects bad device token', r.status === 401, r);

// The parent is signed in again for what follows.
cookie = parentCookie;

r = await call('GET', '/api/learners');
check('parent lists learners with activity', r.data.learners[0].deviceCount === 1 && r.data.learners[0].lastActivityAt > 0, r);
r = await call('GET', `/api/learners/${learnerId}/events`);
check('parent reads events', r.data.events.length === 2, r);
r = await call('GET', `/api/learners/${learnerId}/devices`);
check('parent lists devices', r.data.devices.length === 1, r);
const deviceId = r.data.devices[0].id;

// Another parent must not see this learner.
const otherCookie = cookie;
cookie = '';
await call('POST', '/api/auth/signup', { email: `other+${now}@example.com`, password: 'another pass' });
r = await call('GET', `/api/learners/${learnerId}/events`);
check('other parent is denied', r.status === 404, r);
cookie = otherCookie;

r = await call('DELETE', `/api/learners/${learnerId}/devices/${deviceId}`);
check('unlinks device', r.status === 200, r);
r = await call('GET', '/api/device/me', null, auth);
check('unlinked device loses access', r.status === 401, r);

r = await call('POST', '/api/auth/logout');
r = await call('GET', '/api/auth/me');
check('logout ends session', r.status === 401, r);
r = await call('POST', '/api/auth/login', { email, password: 'wrong password' });
check('rejects wrong password', r.status === 401, r);
r = await call('POST', '/api/auth/login', { email, password: 'correct horse' });
check('logs in', r.status === 200, r);
r = await call('DELETE', `/api/learners/${learnerId}`);
check('deletes learner and data', r.status === 200, r);

// Password reset (the local server returns the link instead of emailing it) and account deletion.
cookie = '';
const resetEmail = `reset+${Date.now()}@example.com`;
await call('POST', '/api/auth/signup', { email: resetEmail, password: 'old password 1' });
await call('POST', '/api/learners', { displayName: 'Gone Soon', settings: {} });
cookie = '';
r = await call('POST', '/api/auth/reset-request', { email: `nobody+${Date.now()}@example.com` });
check('reset for an unknown email looks the same', r.status === 200 && r.data.ok && !r.data.devLink, r);
r = await call('POST', '/api/auth/reset-request', { email: resetEmail });
const devLink = r.data?.devLink;
check('reset request makes a link', r.status === 200 && /\/parent\/reset\?token=/.test(devLink ?? ''), r);
const token = devLink ? new URL(devLink).searchParams.get('token') : '';
r = await call('POST', '/api/auth/reset', { token, password: 'short' });
check('reset rejects a weak password', r.status === 400 && r.data.error === 'weak_password', r);
r = await call('POST', '/api/auth/reset', { token: 'nope', password: 'new password 2' });
check('reset rejects a bad token', r.status === 400 && r.data.error === 'invalid_reset', r);
r = await call('POST', '/api/auth/reset', { token, password: 'new password 2' });
check('reset sets the new password and signs in', r.status === 200 && r.data.email === resetEmail, r);
r = await call('POST', '/api/auth/reset', { token, password: 'new password 3' });
check('reset link works only once', r.status === 400, r);
cookie = '';
r = await call('POST', '/api/auth/login', { email: resetEmail, password: 'new password 2' });
check('new password works', r.status === 200, r);
const signedIn = cookie;
cookie = '';
r = await call('POST', '/api/auth/login', { email: resetEmail, password: 'old password 1' });
// (429 also means "not signed in": repeated test runs trip the login rate limit.)
check('old password no longer works', r.status === 401 || r.status === 429, r);
cookie = signedIn;
r = await call('DELETE', '/api/auth/account', { password: 'wrong password' });
check('deleting needs the password', r.status === 401, r);
r = await call('DELETE', '/api/auth/account', { password: 'new password 2' });
check('deletes the account', r.status === 200, r);
r = await call('GET', '/api/learners');
check('deleted account is signed out', r.status === 401, r);
r = await call('POST', '/api/auth/login', { email: resetEmail, password: 'new password 2' });
check('deleted account cannot sign in', r.status === 401 || r.status === 429, r);

// ---- Onboarding: a child starts alone, moves phones, and a parent connects later.
const cookieNamed = (name) => cookie.split('; ').some((p) => p.startsWith(`${name}=`));
cookie = '';
r = await call('GET', '/api/config');
check('config answers', r.status === 200 && 'turnstileSiteKey' in r.data, r);
r = await call('POST', '/api/start', { avatar: '🦉', theme: 'green', settings: { profile: 'young', language: 'ar', bogus: 1 } });
check('a child starts without signing in', r.status === 200 && r.data.token && r.data.learner.connected === false, r);
check('nothing personal: no name', r.data?.learner.displayName === '' && r.data?.learner.settings.bogus === undefined, r.data);
check('the phone keeps a backup cookie', cookieNamed('ashra_device'), cookie);
const child = { id: r.data.learner.id, auth: { authorization: `Bearer ${r.data.token}` }, token: r.data.token };
const childPhone = cookie;

r = await call('POST', '/api/restore');
check('wiped storage: the cookie brings the child back', r.status === 200 && r.data.token === child.token, r);
cookie = '';
r = await call('POST', '/api/restore');
check('restore without the cookie finds nothing', r.status === 404, r);

r = await call('POST', '/api/device/code', null, child.auth);
check('"show my code" gives a code', /^\d{6}$/.test(r.data.code), r);
r = await call('POST', '/api/pair', { code: r.data.code, label: 'second phone' });
check('the code moves the child to another phone', r.status === 200 && r.data.learner.id === child.id && r.data.token !== child.token, r);

r = await call('POST', '/api/device/code', null, child.auth);
const childCode = r.data.code;
cookie = '';
await call('POST', '/api/auth/signup', { email: `claim+${Date.now()}@example.com`, password: 'claim password' });
const claimer = cookie;
r = await call('POST', '/api/learners/claim', { code: '000000' });
check('connecting rejects a wrong code', r.status === 404, r);
r = await call('POST', '/api/learners/claim', { code: childCode, displayName: 'Kid' });
check('a parent connects the child with the code', r.status === 200 && r.data.learner.connected && r.data.learner.displayName === 'Kid', r);
r = await call('GET', '/api/learners');
check('the child is in the parent account', r.data.learners.some((l) => l.id === child.id), r);
r = await call('GET', '/api/device/me', null, child.auth);
check('the child phone sees the connection and name', r.data.learner.connected && r.data.learner.displayName === 'Kid', r);
r = await call('POST', '/api/device/code', null, child.auth);
const secondCode = r.data.code;
cookie = '';
await call('POST', '/api/auth/signup', { email: `thief+${Date.now()}@example.com`, password: 'thief password' });
r = await call('POST', '/api/learners/claim', { code: secondCode });
check('a connected child cannot be claimed by someone else', r.status === 409 && r.data.error === 'already_connected', r);

// A parent signs in on the child's own phone and connects them there.
cookie = '';
r = await call('POST', '/api/start', { avatar: '🐢', theme: 'teal', settings: {} });
const child2 = { id: r.data.learner.id, auth: { authorization: `Bearer ${r.data.token}` } };
await call('POST', '/api/auth/signup', { email: `onphone+${Date.now()}@example.com`, password: 'phone password' });
r = await call('GET', '/api/auth/me');
check('signing in on a child phone marks it shared, open for now', r.data.shared === true && r.data.locked === false, r);
r = await call('POST', '/api/learners/claim', {}, child2.auth);
check('connects the child on this phone without a code', r.status === 200 && r.data.learner.id === child2.id, r);
await call('POST', '/api/auth/lock');
r = await call('GET', '/api/learners');
check('locked parent area refuses', r.status === 403 && r.data.error === 'locked', r);
r = await call('POST', '/api/auth/unlock', { password: 'nope nope' });
check('unlock needs the right password', r.status === 401, r);
r = await call('POST', '/api/auth/unlock', { password: 'phone password' });
r = await call('GET', '/api/learners');
check('unlocked again with the password', r.status === 200 && r.data.learners.length === 1, r);

// A parent adds a child who will practise on the parent's own phone.
cookie = claimer;
r = await call('GET', '/api/auth/me');
check('a phone without a child is not locked', r.data.shared === false, r);
r = await call('POST', '/api/learners', { displayName: 'Here', settings: {} });
r = await call('POST', `/api/learners/${r.data.learner.id}/this-phone`, { label: 'parent phone' });
check('"this phone" links the parent phone', r.status === 200 && r.data.token, r);
r = await call('GET', '/api/auth/me');
check('…and the parent area now locks when idle', r.data.shared === true, r);

r = await call('POST', '/api/auth/passkey/login-options');
check('passkey sign-in offers a challenge', r.status === 200 && r.data.options.challenge && r.data.challengeId, r);
r = await call('POST', '/api/auth/passkey/login', { challengeId: r.data.challengeId, response: { id: 'nope', response: {} } });
check('a made-up passkey is refused', r.status === 401, r);
r = await call('POST', '/api/auth/passkey/register-options');
check('passkey registration needs an open parent area', r.status === 200 || r.status === 403, r);
cookie = childPhone;
r = await call('POST', '/api/auth/passkey/register-options');
check('passkey registration needs a parent', r.status === 401, r);

console.log(failures ?`\n${failures} check(s) failed` : '\nAll API checks passed');
process.exit(failures ? 1 : 0);
