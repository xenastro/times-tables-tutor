import { useEffect, useState } from 'react';
import { api, ApiError } from '../data/api';
import { n, t } from '../i18n';
import { goBack, navigate } from '../router';
import { AVATARS, THEMES } from '../shared/api';
import { useLearner } from './LearnerContext';

/** Swatch colours mirror the light-theme accents in styles.css. */
export const THEME_SWATCH: Record<string, string> = {
  teal: '#0f8b8d',
  violet: '#6d4fd8',
  coral: '#dd5b48',
  blue: '#2f6fe0',
  green: '#2f9e5b',
  amber: '#c47c12',
};

export function Customize() {
  const { learner, updateLook } = useLearner();
  return (
    <main className="screen">
      <header className="row">
        <button className="icon-btn" aria-label={t('common.back')} onClick={() => goBack('/')}>
          <span className="flip-rtl">←</span>
        </button>
        <h1 style={{ fontSize: '1.4rem' }}>{t('me.title')}</h1>
      </header>
      <div className="row" style={{ justifyContent: 'center' }}>
        <div className="avatar avatar-lg" aria-hidden="true">
          {learner.avatar}
        </div>
      </div>
      <section className="card stack">
        <h2>{t('me.avatar')}</h2>
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button key={a} aria-pressed={learner.avatar === a} onClick={() => updateLook({ avatar: a })}>
              {a}
            </button>
          ))}
        </div>
      </section>
      <section className="card stack">
        <h2>{t('me.theme')}</h2>
        <div className="swatches">
          {THEMES.map((th) => (
            <button
              key={th}
              aria-label={th}
              aria-pressed={learner.theme === th}
              style={{ background: THEME_SWATCH[th] }}
              onClick={() => updateLook({ theme: th })}
            />
          ))}
        </div>
      </section>
      <MyCode />
      <section className="card stack">
        <h2>{t('me.grownUpsTitle')}</h2>
        <p className="muted small">{learner.connected === false ? t('me.grownUpsBody') : t('me.grownUpsConnected')}</p>
        <button className="btn btn-soft" onClick={() => navigate('/parent')}>
          {t('me.grownUpsButton')}
        </button>
      </section>
      <button className="btn btn-primary btn-big" onClick={() => goBack('/')}>
        {t('common.done')}
      </button>
    </main>
  );
}

/** "Show my code": typed on the child's next phone, or by a grown-up to connect them. */
function MyCode() {
  const { token } = useLearner();
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!code) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [code]);

  async function show() {
    setError(null);
    try {
      setCode(await api<{ code: string; expiresAt: number }>('POST', '/device/code', undefined, token));
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'offline' ? t('me.codeOffline') : t('common.error'));
    }
  }

  const live = code && code.expiresAt > now;
  return (
    <section className="card stack">
      <h2>{t('me.codeTitle')}</h2>
      <p className="muted small">{t('me.codeBody')}</p>
      {live ? (
        <>
          <div className="code-display num" aria-live="polite">
            {n(code.code)}
          </div>
          <p className="muted small">{t('me.codeExpires', { m: Math.max(1, Math.ceil((code.expiresAt - now) / 60000)) })}</p>
        </>
      ) : (
        <button className="btn btn-soft" onClick={() => void show()}>
          {t('me.codeButton')}
        </button>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
