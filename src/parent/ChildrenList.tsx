import { useEffect, useState } from 'react';
import { api, ApiError, phoneLabel } from '../data/api';
import { getDevice, setDevice } from '../data/db';
import { t } from '../i18n';
import { navigate } from '../router';
import { AVATARS, type LearnerDTO, type LearnerSummaryDTO } from '../shared/api';
import { relativeDay } from './format';

export function ChildrenList() {
  const [learners, setLearners] = useState<LearnerSummaryDTO[] | null>(null);
  const [adding, setAdding] = useState<false | 'new' | 'code'>(false);
  const [placing, setPlacing] = useState<LearnerDTO | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<{ learners: LearnerSummaryDTO[] }>('GET', '/learners')
      .then((r) => {
        setLearners(r.learners);
        if (!r.learners.length) setAdding('new');
      })
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="error-text">{t('common.error')}</p>;
  if (!learners) return <p className="muted">{t('common.loading')}</p>;

  return (
    <section className="stack">
      <h2 style={{ fontSize: '1.1rem' }}>{t('parent.children')}</h2>
      {!learners.length && !adding && <p className="muted">{t('parent.noChildren')}</p>}
      <div className="grid-2">
        {learners.map((l) => (
          <button key={l.id} className="card child-card" onClick={() => navigate(`/parent/child/${l.id}`)}>
            <span className="avatar avatar-lg" aria-hidden="true">
              {l.avatar}
            </span>
            <span className="stack" style={{ gap: 2 }}>
              <strong style={{ fontSize: '1.15rem' }}>{l.displayName || t('parent.noName')}</strong>
              <span className="muted small">
                {l.lastActivityAt ? t('parent.lastActive', { when: relativeDay(l.lastActivityAt) }) : t('parent.neverActive')}
              </span>
              <span className="muted small">{t('parent.phones', { n: l.deviceCount })}</span>
            </span>
          </button>
        ))}
      </div>
      {placing ? (
        <WherePractise learner={placing} />
      ) : adding === 'new' ? (
        <AddChild
          onCreated={setPlacing}
          onCancel={learners.length ? () => setAdding(false) : undefined}
          onHaveCode={() => setAdding('code')}
        />
      ) : adding === 'code' ? (
        <ConnectWithCode onConnected={(l) => navigate(`/parent/child/${l.id}`)} onCancel={() => setAdding(learners.length ? false : 'new')} />
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <button className="btn btn-soft" onClick={() => setAdding('new')}>
            + {t('parent.addChild')}
          </button>
          <button className="btn btn-ghost" onClick={() => setAdding('code')}>
            {t('connect.codeButton')}
          </button>
        </div>
      )}
    </section>
  );
}

function AddChild({
  onCreated,
  onCancel,
  onHaveCode,
}: {
  onCreated: (l: LearnerDTO) => void;
  onCancel?: () => void;
  onHaveCode: () => void;
}) {
  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [profile, setProfile] = useState<'standard' | 'young'>('standard');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(false);
    try {
      const settings =
        profile === 'young'
          ? { profile, sessionLength: 20, pictureHints: 'always', thresholdOffsetMs: 1500 }
          : { profile };
      const { learner } = await api<{ learner: LearnerDTO }>('POST', '/learners', {
        displayName: name.trim(),
        birthYear: birthYear ? Number(birthYear) : null,
        avatar,
        theme: 'teal',
        settings,
      });
      onCreated(learner);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{t('parent.addChild')}</h2>
      <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={onHaveCode}>
        {t('connect.alreadyUses')}
      </button>
      <label className="field">
        {t('parent.name')}
        <input className="input" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        {t('parent.birthYear')}
        <input
          className="input num"
          inputMode="numeric"
          maxLength={4}
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </label>
      <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 6 }}>{t('parent.profile')}</legend>
        {(['standard', 'young'] as const).map((p) => (
          <button
            type="button"
            key={p}
            className="chip"
            aria-pressed={profile === p}
            onClick={() => setProfile(p)}
            style={{ borderRadius: 14, textAlign: 'start', padding: '10px 14px' }}
          >
            <strong>{t(p === 'standard' ? 'parent.profileStandard' : 'parent.profileYoung')}</strong>
            <br />
            <span className="small muted">{t(p === 'standard' ? 'parent.profileStandardNote' : 'parent.profileYoungNote')}</span>
          </button>
        ))}
      </fieldset>
      <div className="avatar-grid">
        {AVATARS.map((a) => (
          <button type="button" key={a} aria-pressed={avatar === a} onClick={() => setAvatar(a)}>
            {a}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{t('common.error')}</p>}
      <div className="row">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
        <button className="btn btn-primary grow" disabled={busy || !name.trim()}>
          {t('parent.create')}
        </button>
      </div>
    </form>
  );
}

/** After adding a child: this same phone (the parent's), or the child's own phone. */
function WherePractise({ learner }: { learner: LearnerDTO }) {
  const [phoneFree, setPhoneFree] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // One child per phone: "this phone" only while no child practises here.
    void getDevice().then((d) => setPhoneFree(!d));
  }, []);

  async function thisPhone() {
    setBusy(true);
    setError(false);
    try {
      const r = await api<{ token: string; learner: LearnerDTO }>('POST', `/learners/${learner.id}/this-phone`, { label: phoneLabel() });
      await setDevice({ token: r.token, learner: r.learner, lastSeq: 0 });
      navigate('/', { replace: true });
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="where-title">
      <h2 id="where-title">{t('connect.whereTitle', { name: learner.displayName })}</h2>
      {phoneFree && (
        <>
          <button className="btn btn-primary" disabled={busy} onClick={() => void thisPhone()}>
            {t('connect.thisPhone')}
          </button>
          <p className="muted small">{t('connect.thisPhoneNote')}</p>
        </>
      )}
      <button className="btn btn-soft" onClick={() => navigate(`/parent/child/${learner.id}`)}>
        {t('connect.anotherPhone')}
      </button>
      {error && <p className="error-text">{t('common.error')}</p>}
    </section>
  );
}

/** A child who started on their own: their phone shows a code under "Make it yours". */
function ConnectWithCode({ onConnected, onCancel }: { onConnected: (l: LearnerDTO) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { learner } = await api<{ learner: LearnerDTO }>('POST', '/learners/claim', { code, displayName: name.trim() || undefined });
      onConnected(learner);
    } catch (err) {
      const c = err instanceof ApiError ? err.code : 'server_error';
      const msg = t(`connect.errors.${c}`);
      setError(msg.startsWith('connect.') ? t('common.error') : msg);
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{t('connect.codeTitle')}</h2>
      <p className="muted small">{t('connect.codeBody')}</p>
      <label className="field">
        {t('connect.codeLabel')}
        <input
          className="input num"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/D/g, '').slice(0, 6))}
          style={{ fontSize: '1.5rem', letterSpacing: '0.3em', textAlign: 'center' }}
        />
      </label>
      <label className="field">
        {t('connect.nameLabel')}
        <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary grow" disabled={busy || code.length !== 6}>
          {t('connect.codeConnect')}
        </button>
      </div>
    </form>
  );
}
