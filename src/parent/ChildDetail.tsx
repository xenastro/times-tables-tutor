import { useCallback, useEffect, useMemo, useState } from 'react';
import { FactMap, Legend } from '../components/FactMap';
import { Sheet } from '../components/FactSheet';
import { GuideSteps } from '../components/StrategyView';
import { TurnaroundToggle } from '../components/TurnaroundShow';
import { factKey } from '../engine/facts';
import { activeFacts, DAY, deriveState, fluentCount, median } from '../engine/mastery';
import { dailyStats, factHistory, feelings, practiceDaysLast7, sessionHistory, troubleFacts } from '../engine/stats';
import { withDefaults, type AnswerPayload, type TutorEvent } from '../engine/types';
import { api } from '../data/api';
import { t } from '../i18n';
import { goBack, navigate } from '../router';
import type { EventsPage, LearnerDTO, LearnerSummaryDTO } from '../shared/api';
import { BarChart, LineChart } from './Charts';
import { Devices } from './Devices';
import { seconds, shortDate, shortDateTime } from './format';
import { SettingsPanel } from './SettingsPanel';

const FEELING_EMOJI = { calm: '😌', ok: '🙂', hard: '😣' } as const;

async function loadAllEvents(id: string): Promise<TutorEvent[]> {
  const out: TutorEvent[] = [];
  let since = 0;
  for (;;) {
    const page = await api<EventsPage>('GET', `/learners/${id}/events?since=${since}`);
    for (const e of page.events) out.push({ ...e, learnerId: id });
    since = page.lastSeq;
    if (!page.more) break;
  }
  return out;
}

function windowStats(events: TutorEvent[], from: number, to: number) {
  const answers = events
    .filter((e) => e.type === 'answer' && e.ts >= from && e.ts < to)
    .map((e) => e.payload as AnswerPayload);
  const correct = answers.filter((a) => a.correct);
  return {
    count: answers.length,
    accuracy: answers.length ? correct.length / answers.length : null,
    medianMs: correct.length ? median(correct.map((a) => a.latencyMs)) : null,
  };
}

export function ChildDetail({ id }: { id: string }) {
  const [learner, setLearner] = useState<LearnerDTO | null>(null);
  const [events, setEvents] = useState<TutorEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<[number, number] | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ learners }, evs] = await Promise.all([
        api<{ learners: LearnerSummaryDTO[] }>('GET', '/learners'),
        loadAllEvents(id),
      ]);
      const l = learners.find((x) => x.id === id);
      if (!l) {
        navigate('/parent', { replace: true });
        return;
      }
      setLearner(l);
      setEvents(evs);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const settings = useMemo(() => withDefaults(learner?.settings), [learner]);
  const state = useMemo(() => (events ? deriveState(events, settings) : null), [events, settings]);

  if (error) return <p className="error-text">{t('common.error')}</p>;
  if (!learner || !events || !state) return <p className="muted">{t('common.loading')}</p>;

  const now = Date.now();
  const total = activeFacts(state).length;
  const fluent = fluentCount(state);
  const week = windowStats(events, now - 7 * DAY, now + DAY);
  const prevWeek = windowStats(events, now - 14 * DAY, now - 7 * DAY);
  const days = dailyStats(events, now, 14);
  const trouble = troubleFacts(state);
  const feels = feelings(events);
  const sessions = sessionHistory(events);
  const speedDelta = week.medianMs != null && prevWeek.medianMs != null ? week.medianMs - prevWeek.medianMs : null;

  const selKey = selected ? factKey(...selected) : null;
  const selFact = selKey ? state.facts[selKey] : null;
  const selHistory = selKey ? factHistory(events, selKey).slice(-12) : [];

  return (
    <>
      <header className="parent-header">
        <div className="row">
          <button className="icon-btn" aria-label={t('common.back')} onClick={() => goBack('/parent')}>
            ←
          </button>
          <span className="avatar" aria-hidden="true">
            {learner.avatar}
          </span>
          <h1>{learner.displayName}</h1>
        </div>
        <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh">
          ↻
        </button>
      </header>

      <section className="tiles" aria-label={t('parent.overview')}>
        <div className="stat">
          <div className="value">
            {fluent} <small>/ {total}</small>
          </div>
          <div className="label">{t('parent.fluentFacts')}</div>
        </div>
        <div className="stat">
          <div className="value">
            {practiceDaysLast7(events, now)} <small>/ 7</small>
          </div>
          <div className="label">{t('parent.practiceDays')}</div>
        </div>
        <div className="stat">
          <div className="value">{week.accuracy == null ? '–' : `${Math.round(week.accuracy * 100)}%`}</div>
          <div className="label">{t('parent.accuracy7')}</div>
        </div>
        <div className="stat">
          <div className="value">
            {seconds(week.medianMs)}
            <small>s</small>
          </div>
          <div className="label">
            {t('parent.speed7')}
            {speedDelta != null && Math.abs(speedDelta) >= 100 && (
              <>
                {' '}
                <span className={`pill ${speedDelta < 0 ? 'good' : ''}`}>
                  {speedDelta < 0 ? '↓' : '↑'} {seconds(Math.abs(speedDelta))}s
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="card stack map-card">
          <h2>{t('parent.map')}</h2>
          <p className="muted small">{t('parent.mapNote')}</p>
          <FactMap state={state} onSelect={(a, b) => setSelected([a, b])} showProductsFrom={1} />
          <Legend />
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card stack">
            <h2>{t('parent.trouble')}</h2>
            {trouble.length ? (
              <div className="list">
                {trouble.map((f) => (
                  <button
                    key={f.key}
                    className="row spread"
                    style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--line)', textAlign: 'start' }}
                    onClick={() => setSelected([f.a, f.b])}
                  >
                    <strong className="num">
                      {f.a} × {f.b}
                    </strong>
                    <span className="row" style={{ gap: 8 }}>
                      <span className={`pill ${f.accuracy < 1 ? 'warm' : 'good'}`}>
                        {t('parent.acc', { pct: Math.round(f.accuracy * 100) })}
                      </span>
                      <span className={`pill ${(f.medianLatencyMs ?? 0) > state.thresholdMs ? 'warm' : ''}`}>
                        {t('parent.time', { s: seconds(f.medianLatencyMs) })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">{t('parent.troubleNone')}</p>
            )}
          </section>

          <section className="card stack">
            <h2>{t('parent.feelings')}</h2>
            {feels.length ? (
              <div className="emoji-row">
                {feels.map((f) => (
                  <span key={f.ts} title={shortDateTime(f.ts)}>
                    {FEELING_EMOJI[f.feeling]}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">{t('parent.feelingsNone')}</p>
            )}
          </section>
        </div>
      </div>

      <div className="grid-2">
        <section className="card stack">
          <h2>{t('parent.minutes')}</h2>
          <p className="muted small">{t('parent.activity')}</p>
          <BarChart
            label={t('parent.minutes')}
            data={days.map((d) => ({
              label: String(Number(d.day.slice(8))),
              value: d.minutes,
              detail: `${shortDate(new Date(d.day + 'T12:00').getTime())}: ${d.minutes} min · ${d.answers} answers`,
            }))}
          />
        </section>
        <section className="card stack">
          <h2>{t('parent.speedChart')}</h2>
          <p className="muted small">{t('parent.speedNote')}</p>
          <LineChart
            label={t('parent.speedChart')}
            data={days.map((d) => ({
              label: String(Number(d.day.slice(8))),
              value: d.medianLatencyMs == null ? null : Math.round(d.medianLatencyMs / 100) / 10,
              detail: `${shortDate(new Date(d.day + 'T12:00').getTime())}: ${seconds(d.medianLatencyMs)}s`,
            }))}
          />
        </section>
      </div>

      <section className="card stack">
        <h2>{t('parent.sessions')}</h2>
        {sessions.length ? (
          <table className="simple">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Answers</th>
                <th>Right</th>
                <th>Minutes</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td>{shortDateTime(s.ts)}</td>
                  <td>{s.kind === 'checkup' ? t('parent.sessionCheckup') : t('parent.sessionPractice')}</td>
                  <td>{s.answered}</td>
                  <td>{s.answered ? `${Math.round((s.correct / s.answered) * 100)}%` : '–'}</td>
                  <td>{(s.durationMs / 60000).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('parent.sessionsNone')}</p>
        )}
      </section>

      <div className="grid-2">
        <Devices learnerId={learner.id} />
        <SettingsPanel learner={learner} onSaved={setLearner} />
      </div>

      {selected && selFact && (
        <Sheet onClose={() => setSelected(null)}>
          <p className="num" style={{ fontSize: '2rem', fontWeight: 700 }}>
            {t('parent.factDetail', { a: selected[0], b: selected[1], p: selected[0] * selected[1] })}
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className={`pill ${selFact.level >= 3 ? 'good' : selFact.level >= 1 ? 'warm' : ''}`}>
              {t(`map.factLevel${selFact.level}`)}
            </span>
            <span className="pill">
              {selFact.attempts ? t('parent.attempts', { n: selFact.attempts }) : t('parent.noAttempts')}
            </span>
            {selFact.recentLatencies.length > 0 && (
              <span className="pill">{t('parent.time', { s: seconds(median(selFact.recentLatencies)) })}</span>
            )}
          </div>
          {selHistory.length > 0 && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {selHistory.map((h, i) => (
                <span key={i} className={`pill ${h.correct ? 'good' : 'warm'}`} title={shortDateTime(h.ts)}>
                  {h.correct ? '✓' : '·'} {seconds(h.latencyMs)}s
                </span>
              ))}
            </div>
          )}
          <GuideSteps a={selected[0]} b={selected[1]} />
          <TurnaroundToggle key={selected.join('x')} a={selected[0]} b={selected[1]} />
        </Sheet>
      )}
    </>
  );
}
