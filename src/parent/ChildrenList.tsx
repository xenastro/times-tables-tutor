import { useEffect, useState } from 'react';
import { api } from '../data/api';
import { t } from '../i18n';
import { navigate } from '../router';
import { AVATARS, type LearnerDTO, type LearnerSummaryDTO } from '../shared/api';
import { relativeDay } from './format';

export function ChildrenList() {
  const [learners, setLearners] = useState<LearnerSummaryDTO[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<{ learners: LearnerSummaryDTO[] }>('GET', '/learners')
      .then((r) => {
        setLearners(r.learners);
        if (!r.learners.length) setAdding(true);
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
              <strong style={{ fontSize: '1.15rem' }}>{l.displayName}</strong>
              <span className="muted small">
                {l.lastActivityAt ? t('parent.lastActive', { when: relativeDay(l.lastActivityAt) }) : t('parent.neverActive')}
              </span>
              <span className="muted small">{t('parent.phones', { n: l.deviceCount })}</span>
            </span>
          </button>
        ))}
      </div>
      {adding ? (
        <AddChild
          onCreated={(l) => navigate(`/parent/child/${l.id}`)}
          onCancel={learners.length ? () => setAdding(false) : undefined}
        />
      ) : (
        <button className="btn btn-soft" onClick={() => setAdding(true)}>
          + {t('parent.addChild')}
        </button>
      )}
    </section>
  );
}

function AddChild({ onCreated, onCancel }: { onCreated: (l: LearnerDTO) => void; onCancel?: () => void }) {
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
