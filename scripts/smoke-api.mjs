// End-to-end check of the API against a running server.
// Usage: node scripts/smoke-api.mjs [baseUrl] [inviteCode]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const INVITE = process.argv[3] ?? 'family-test';

let cookie = '';
let failures = 0;

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
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

let r = await call('POST', '/api/auth/signup', { email, password: 'short', inviteCode: INVITE });
check('rejects weak password', r.status === 400 && r.data.error === 'weak_password', r);
r = await call('POST', '/api/auth/signup', { email, password: 'correct horse', inviteCode: 'nope' });
check('rejects wrong invite code', r.status === 403, r);
r = await call('POST', '/api/auth/signup', { email, password: 'correct horse', inviteCode: INVITE });
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
await call('POST', '/api/auth/signup', { email: `other+${now}@example.com`, password: 'another pass', inviteCode: INVITE });
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

console.log(failures ? `\n${failures} check(s) failed` : '\nAll API checks passed');
process.exit(failures ? 1 : 0);
