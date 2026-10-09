import { t } from '../i18n';
import { goBack } from '../router';
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
          ←
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
      <button className="btn btn-primary btn-big" onClick={() => goBack('/')}>
        {t('common.done')}
      </button>
    </main>
  );
}
