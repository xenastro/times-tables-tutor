import { useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { FactMap } from '../components/FactMap';
import { LESSONS, nextLesson } from '../engine/lessons';
import { DAY, fluentCount, activeFacts } from '../engine/mastery';
import { dayKey, practisedToday } from '../engine/stats';
import { n, t } from '../i18n';
import { navigate } from '../router';
import { useLearner } from './LearnerContext';
import { SoundToggle } from './ReadAloud';

export function Home() {
  const { learner, state, events, syncStatus, settings } = useLearner();
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
  const practiceDays = useMemo(() => new Set(events.filter((e) => e.type === 'answer').map((e) => dayKey(e.ts))).size, [events]);
  const [nudgeHidden, setNudgeHidden] = useState(nudgeDismissed);
  // A child who started alone: after a few days, a calm word about keeping their progress safe.
  const nudge = learner.connected === false && practiceDays >= NUDGE_AFTER_DAYS && !nudgeHidden;

  const { checkup } = state;
  // Younger learners start with the "Understand" lessons, before the check-up.
  const young = settings.profile === 'young';
  const lesson = young ? nextLesson(state.lessonsDone) : null;
  let cta: { label: string; note: string; primary: boolean; to: string };
  if (lesson && !checkup.started)
    cta = {
      label: t('lesson.startLesson', { title: t(`lesson.title_${lesson}`) }),
      note: t('lesson.startLessonNote'),
      primary: true,
      to: `/lesson/${lesson}`,
    };
  else if (!checkup.started) cta = { label: t('home.startCheckup'), note: t('home.startCheckupNote'), primary: true, to: '/practice' };
  else if (!checkup.done)
    cta = {
      label: t('home.continueCheckup'),
      note: t('home.continueCheckupNote', { n: checkup.remaining.length }),
      primary: true,
      to: '/practice',
    };
  else if (doneToday) cta = { label: t('home.again'), note: t('home.doneToday'), primary: false, to: '/practice' };
  else cta = { label: t('home.start'), note: t('home.startNote'), primary: true, to: '/practice' };

  return (
    <main className="screen">
      <header className="row spread">
        <div className="row">
          <button className="avatar" aria-label={t('me.title')} onClick={() => navigate('/me')}>
            {learner.avatar}
          </button>
          <h1 style={{ fontSize: '1.4rem' }}>{learner.displayName ? t('home.hi', { name: learner.displayName }) : t('home.hiNoName')}</h1>
        </div>
        <SoundToggle />
      </header>

      {needRefresh && (
        <button className="banner" onClick={() => updateServiceWorker(true)}>
          {t('common.updateReady')}
        </button>
      )}

      {nudge && (
        <section className="card stack" aria-labelledby="nudge-title">
          <h2 id="nudge-title">{t('home.keepSafeTitle')}</h2>
          <p className="muted small">{t('home.keepSafeBody')}</p>
          <div className="row">
            <button className="btn btn-soft grow" onClick={() => navigate('/me')}>
              {t('home.keepSafeHow')}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                dismissNudge();
                setNudgeHidden(true);
              }}
            >
              {t('home.notNow')}
            </button>
          </div>
        </section>
      )}

      <section className="hero">
        <button
          className={`btn btn-big ${cta.primary ? 'btn-primary' : 'btn-soft'}`}
          onClick={() => navigate(cta.to)}
        >
          {cta.label}
        </button>
        <p className="note">{cta.note}</p>
      </section>

      {young && (
        <section className="card stack" aria-labelledby="path-title">
          <h2 id="path-title">{t('lesson.pathTitle')}</h2>
          <p className="muted small">{t('lesson.pathNote')}</p>
          <ol className="lesson-path">
            {LESSONS.map((id) => {
              const isDone = state.lessonsDone.includes(id);
              const open = isDone || id === lesson;
              return (
                <li key={id}>
                  <button className={`chip${isDone ? ' done' : ''}`} disabled={!open} onClick={() => navigate(`/lesson/${id}`)}>
                    {isDone ? '✓ ' : ''}
                    {t(`lesson.title_${id}`)}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {checkup.started && (
        <section className="stat-row">
          <div className="stat">
            <div className="value">
              {n(fluent)} <small>/ {n(total)}</small>
            </div>
            <div className="label">{t('home.fluent')}</div>
          </div>
          <div className="stat">
            <div className="value">
              {n(daysThisWeek)} <small>/ {n(7)}</small>
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

      {checkup.done && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 style={{ fontSize: '1.05rem' }}>{t('games.title')}</h2>
          <div className="row" style={{ gap: 10, alignItems: 'stretch' }}>
            <button className="btn btn-soft grow" onClick={() => navigate('/games/pairs')}>
              🧩 {t('games.pairs')}
            </button>
            <button className="btn btn-soft grow" onClick={() => navigate('/games/row')}>
              🟩 {t('games.row')}
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

const NUDGE_AFTER_DAYS = 3;
const NUDGE_KEY = 'ashra.nudgeDismissed';

/** "Not now" hides the card for a week. */
function nudgeDismissed(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(NUDGE_KEY) ?? 0) < 7 * DAY;
  } catch {
    return false;
  }
}

function dismissNudge() {
  try {
    localStorage.setItem(NUDGE_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}
