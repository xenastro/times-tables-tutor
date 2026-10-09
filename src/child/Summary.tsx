import { useMemo, useState } from 'react';
import { FactMap, Legend } from '../components/FactMap';
import { fluentCount, type LearnerState } from '../engine/mastery';
import type { Feeling } from '../engine/types';
import { t } from '../i18n';
import { navigate } from '../router';
import { useLearner } from './LearnerContext';

const FEELINGS: { value: Feeling; emoji: string; label: string }[] = [
  { value: 'calm', emoji: '😌', label: 'summary.feelCalm' },
  { value: 'ok', emoji: '🙂', label: 'summary.feelOk' },
  { value: 'hard', emoji: '😣', label: 'summary.feelHard' },
];

export function Summary({
  kind,
  sessionId,
  answered,
  startState,
  newFacts,
}: {
  kind: 'checkup' | 'practice';
  sessionId: string;
  answered: number;
  startState: LearnerState;
  newFacts: string[];
}) {
  const { state, addEvents } = useLearner();
  const [feeling, setFeeling] = useState<Feeling | null>(null);

  const movedUp = useMemo(() => {
    const keys = new Set<string>();
    for (const [key, f] of Object.entries(state.facts)) {
      if (f.level > startState.facts[key].level) keys.add(key);
    }
    return keys;
  }, [state, startState]);

  const fluent = fluentCount(state);
  const title =
    kind === 'practice' ? t('summary.title') : state.checkup.done ? t('summary.checkupDoneTitle') : t('summary.checkupTitle');

  function pickFeeling(f: Feeling) {
    if (feeling) return;
    setFeeling(f);
    addEvents([{ type: 'feeling', payload: { sessionId, feeling: f } }]);
  }

  return (
    <main className="screen">
      <h1 style={{ fontSize: '1.6rem' }}>{title}</h1>

      {kind === 'practice' ? (
        <section className="stat-row">
          <div className="stat">
            <div className="big-number">{answered}</div>
            <div className="label">{t('summary.answered')}</div>
          </div>
          <div className="stat">
            <div className="big-number">{movedUp.size}</div>
            <div className="label">{t('summary.movedUp')}</div>
          </div>
        </section>
      ) : (
        <p className="strategy-text">{t('summary.fluentNow', { n: fluent })}</p>
      )}

      {newFacts.length > 0 && (
        <p className="muted">
          {t('summary.newFacts')}:{' '}
          <strong className="num">{newFacts.map((k) => k.replace('x', ' × ')).join(', ')}</strong>
        </p>
      )}

      <section className="card stack map-card">
        <FactMap state={state} highlight={movedUp} />
        <Legend />
      </section>

      <section className="stack">
        <h2 style={{ fontSize: '1.05rem' }}>{t('summary.feelingQ')}</h2>
        <div className="feelings">
          {FEELINGS.map((f) => (
            <button key={f.value} aria-pressed={feeling === f.value} onClick={() => pickFeeling(f.value)} disabled={!!feeling && feeling !== f.value}>
              <span aria-hidden="true">{f.emoji}</span>
              {t(f.label)}
            </button>
          ))}
        </div>
        {feeling && <p className="muted small">{t('summary.thanks')}</p>}
      </section>

      <button className="btn btn-primary btn-big" onClick={() => navigate('/', { replace: true })}>
        {t('summary.home')}
      </button>
    </main>
  );
}
