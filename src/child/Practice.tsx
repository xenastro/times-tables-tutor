import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DotPicture, StrategyView } from '../components/StrategyView';
import { CheckupSession, PracticeSession, type Question } from '../engine/session';
import { strategyFor } from '../engine/strategies';
import { newId } from '../data/api';
import { t } from '../i18n';
import { navigate } from '../router';
import { useLearner } from './LearnerContext';
import { NumberPad } from './NumberPad';
import { Summary } from './Summary';

type Phase =
  | { kind: 'intro' }
  | { kind: 'strategy'; q: Question }
  | { kind: 'ask'; q: Question }
  | { kind: 'feedback'; q: Question; given: number | null; correct: boolean }
  | { kind: 'reveal'; q: Question }
  | { kind: 'break' }
  | { kind: 'summary' };

const FEEDBACK_MS = 450;
const MAX_DIGITS = 3;

export function Practice() {
  const { state, settings, addEvents } = useLearner();

  // Snapshot what the learner knew at the start, for the summary.
  const [startState] = useState(state);
  const [session] = useState(() => {
    const id = newId();
    return state.checkup.done
      ? new PracticeSession(state, settings, id, Date.now())
      : new CheckupSession(state, settings, id);
  });
  const isCheckup = session instanceof CheckupSession;
  const [phase, setPhase] = useState<Phase>(isCheckup && !state.checkup.started ? { kind: 'intro' } : { kind: 'break' });
  const [input, setInput] = useState('');
  const [hintOpen, setHintOpen] = useState(false);
  const hintUsed = useRef(false);
  const askedAt = useRef(0);
  const startedAt = useRef(Date.now());
  const started = useRef(false);
  const ended = useRef(false);
  const lastBreakAt = useRef(0);

  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    if (session.answered === 0) {
      navigate('/', { replace: true });
      return;
    }
    addEvents([
      {
        type: 'session_end',
        payload: {
          sessionId: session.sessionId,
          kind: isCheckup ? 'checkup' : 'practice',
          answered: session.answered,
          correct: session.correctCount,
          durationMs: Date.now() - startedAt.current,
        },
      },
    ]);
    setPhase({ kind: 'summary' });
  }, [addEvents, isCheckup, session]);

  const advance = useCallback(() => {
    if (session instanceof CheckupSession && session.offerBreak && lastBreakAt.current !== session.answered) {
      lastBreakAt.current = session.answered;
      setPhase({ kind: 'break' });
      return;
    }
    const q = session.next();
    if (!q) {
      finish();
      return;
    }
    setInput('');
    setHintOpen(false);
    hintUsed.current = false;
    if (q.showStrategyFirst) {
      addEvents([{ type: 'strategy_viewed', payload: { a: q.a, b: q.b, sessionId: session.sessionId } }]);
      setPhase({ kind: 'strategy', q });
    } else {
      setPhase({ kind: 'ask', q });
    }
  }, [addEvents, finish, session]);

  // Start once (guarded against double effects in development).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    addEvents([{ type: 'session_start', payload: { sessionId: session.sessionId, kind: isCheckup ? 'checkup' : 'practice' } }]);
    if (phase.kind !== 'intro') advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Time each question from the moment it's on screen.
  useEffect(() => {
    if (phase.kind === 'ask') askedAt.current = performance.now();
  }, [phase]);

  const submit = useCallback(
    (given: number | null) => {
      if (phase.kind !== 'ask') return;
      const q = phase.q;
      const latencyMs = performance.now() - askedAt.current;
      const res = session.record(q, { given, latencyMs, hintUsed: hintUsed.current });
      addEvents(res.events);
      if (isCheckup || res.correct) {
        setPhase({ kind: 'feedback', q, given, correct: res.correct });
        window.setTimeout(advance, isCheckup ? 300 : FEEDBACK_MS);
      } else {
        setPhase({ kind: 'reveal', q });
      }
    },
    [addEvents, advance, isCheckup, phase, session],
  );

  const press = useCallback(
    (key: string) => {
      if (phase.kind !== 'ask') return;
      if (key === 'back') {
        setInput((s) => s.slice(0, -1));
        return;
      }
      if (key === 'enter') {
        if (input) submit(Number(input));
        return;
      }
      const next = (input + key).replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS);
      setInput(next);
      // Auto-submit once the answer has as many digits as the right answer.
      if (next.length >= String(phase.q.a * phase.q.b).length) submit(Number(next));
    },
    [input, phase, submit],
  );

  // Physical keyboard support (handy on a laptop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') {
        if (phase.kind === 'ask') press('enter');
        else if (phase.kind === 'strategy') setPhase({ kind: 'ask', q: phase.q });
        else if (phase.kind === 'reveal') advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, phase, press]);

  const progress = useMemo(() => {
    if (session instanceof CheckupSession) {
      const total = session.answered + session.remaining;
      return total ? session.answered / total : 0;
    }
    return session.progress;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session]);

  if (phase.kind === 'summary') {
    return (
      <Summary
        kind={isCheckup ? 'checkup' : 'practice'}
        sessionId={session.sessionId}
        answered={session.answered}
        startState={startState}
        newFacts={session instanceof PracticeSession ? session.newIntroduced : []}
      />
    );
  }

  const showHintButton = !isCheckup && phase.kind === 'ask';
  const alwaysPicture =
    settings.pictureHints === 'always' && phase.kind === 'ask' && ['new', 'learning', 'retry', 'repeat'].includes(phase.q.kind);

  return (
    <main className="practice">
      <div className="practice-top">
        <button className="icon-btn" aria-label={t('practice.exit')} title={t('practice.exit')} onClick={finish}>
          ✕
        </button>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {phase.kind === 'intro' && (
        <div className="panel">
          <p className="kicker">{t('home.startCheckup')}</p>
          <p className="strategy-text">{t('practice.checkupIntro')}</p>
          <button className="btn btn-primary btn-big" onClick={advance}>
            {t('common.continue')}
          </button>
        </div>
      )}

      {phase.kind === 'break' && session.answered > 0 && (
        <div className="panel">
          <h2 style={{ fontSize: '1.5rem' }}>{t('practice.breakTitle', { n: session.answered })}</h2>
          <p className="muted">{t('practice.breakBody')}</p>
          <button className="btn btn-primary btn-big" onClick={advance}>
            {t('practice.keepGoing')}
          </button>
          <button className="btn btn-big" onClick={finish}>
            {t('practice.finishLater')}
          </button>
        </div>
      )}

      {phase.kind === 'strategy' && (
        <div className="panel">
          <p className="kicker">{t('practice.newFact')}</p>
          <p className="fact num">
            {phase.q.a} × {phase.q.b} = {phase.q.a * phase.q.b}
          </p>
          <p className="muted">{t('practice.newFactNote')}</p>
          <StrategyView a={phase.q.a} b={phase.q.b} showPicture={settings.pictureHints !== 'off'} />
          <button className="btn btn-primary btn-big" onClick={() => setPhase({ kind: 'ask', q: phase.q })}>
            {t('common.gotIt')}
          </button>
        </div>
      )}

      {phase.kind === 'reveal' && (
        <div className="panel">
          <p className="fact num">{t('practice.reveal', { a: phase.q.a, b: phase.q.b, p: phase.q.a * phase.q.b })}</p>
          <p className="muted">{t('practice.revealNote')}</p>
          <StrategyView a={phase.q.a} b={phase.q.b} showPicture={settings.pictureHints !== 'off'} />
          <button className="btn btn-primary btn-big" onClick={advance} autoFocus>
            {t('common.gotIt')}
          </button>
        </div>
      )}

      {(phase.kind === 'ask' || phase.kind === 'feedback') && (
        <>
          <div className="question-area">
            <div className="question num" aria-live="polite">
              {phase.q.a}
              <span className="times">×</span>
              {phase.q.b}
            </div>
            <div
              className={`answer-box num ${
                phase.kind === 'feedback' ? (isCheckup ? 'neutral' : 'good') : 'active'
              }`}
              aria-label="Your answer"
            >
              {phase.kind === 'feedback' ? (phase.given ?? '–') : input}
            </div>
            {hintOpen && phase.kind === 'ask' && <StrategyView a={phase.q.a} b={phase.q.b} showPicture={settings.pictureHints !== 'off'} />}
            {alwaysPicture && !hintOpen && <DotPicture strategy={strategyFor(phase.q.a, phase.q.b)} />}
          </div>
          <div className="hint-row">
            {showHintButton && !hintOpen && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  hintUsed.current = true;
                  setHintOpen(true);
                  addEvents([{ type: 'hint_shown', payload: { a: phase.q.a, b: phase.q.b, sessionId: session.sessionId } }]);
                }}
              >
                💡 {t('practice.hint')}
              </button>
            )}
            {isCheckup && phase.kind === 'ask' && (
              <button className="btn btn-ghost" onClick={() => submit(null)}>
                {t('practice.notSure')}
              </button>
            )}
          </div>
          <NumberPad onPress={press} disabled={phase.kind !== 'ask'} canSubmit={input.length > 0} />
        </>
      )}
    </main>
  );
}
