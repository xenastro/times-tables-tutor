import { useMemo } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { FactMap } from '../components/FactMap';
import { DAY, fluentCount, activeFacts } from '../engine/mastery';
import { dayKey, practisedToday } from '../engine/stats';
import { t } from '../i18n';
import { navigate } from '../router';
import { useLearner } from './LearnerContext';

export function Home() {
  const { learner, state, events, syncStatus } = useLearner();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const now = Date.now();
  const total = activeFacts(state).length;
  const fluent = fluentCount(state);
  const doneToday = practisedToday(events, now);

  const week = useMemo(() => {
    const days = new Set(events.filter((e) => e.type === 'answer').map((e) => dayKey(e.ts)));
    return Array.from({ length: 7 }, (_, i) => days.has(dayKey(now - (6 - i) * DAY)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);
  const daysThisWeek = week.filter(Boolean).length;

  const { checkup } = state;
  let cta: { label: string; note: string; primary: boolean };
  if (!checkup.started) cta = { label: t('home.startCheckup'), note: t('home.startCheckupNote'), primary: true };
  else if (!checkup.done)
    cta = { label: t('home.continueCheckup'), note: t('home.continueCheckupNote', { n: checkup.remaining.length }), primary: true };
  else if (doneToday) cta = { label: t('home.again'), note: t('home.doneToday'), primary: false };
  else cta = { label: t('home.start'), note: t('home.startNote'), primary: true };

  return (
    <main className="screen">
      <header className="row spread">
        <div className="row">
          <button className="avatar" aria-label={t('me.title')} onClick={() => navigate('/me')}>
            {learner.avatar}
          </button>
          <h1 style={{ fontSize: '1.4rem' }}>{t('home.hi', { name: learner.displayName })}</h1>
        </div>
      </header>

      {needRefresh && (
        <button className="banner" onClick={() => updateServiceWorker(true)}>
          {t('common.updateReady')}
        </button>
      )}

      <section className="hero">
        <button
          className={`btn btn-big ${cta.primary ? 'btn-primary' : 'btn-soft'}`}
          onClick={() => navigate('/practice')}
        >
          {cta.label}
        </button>
        <p className="note">{cta.note}</p>
      </section>

      {checkup.started && (
        <section className="stat-row">
          <div className="stat">
            <div className="value">
              {fluent} <small>/ {total}</small>
            </div>
            <div className="label">{t('home.fluent')}</div>
          </div>
          <div className="stat">
            <div className="value">
              {daysThisWeek} <small>/ 7</small>
            </div>
            <div className="week-dots" aria-hidden="true">
              {week.map((on, i) => (
                <span key={i} className={on ? 'on' : ''} />
              ))}
            </div>
            <div className="label">{t('home.days')}</div>
          </div>
        </section>
      )}

      {checkup.started && (
        <section className="card stack">
          <button
            onClick={() => navigate('/map')}
            style={{ background: 'none', border: 'none', padding: 0 }}
            aria-label={t('home.seeMap')}
          >
            <FactMap state={state} compact />
          </button>
          <div className="row spread">
            <p className="muted small">{state.activeMax === 12 ? t('home.bonusUnlocked') : t('home.bonusLocked')}</p>
            <button className="link" onClick={() => navigate('/map')}>
              {t('home.seeMap')}
            </button>
          </div>
        </section>
      )}

      <p className="sync" aria-live="polite">
        {syncStatus === 'offline' ? t('common.offline') : syncStatus === 'syncing' ? t('common.syncing') : t('common.synced')}
      </p>
    </main>
  );
}
