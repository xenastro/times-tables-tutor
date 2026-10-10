import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarModel } from '../components/StrategyView';
import { NumberWordsShow } from '../components/NumberWordsShow';
import { TurnaroundShow } from '../components/TurnaroundShow';
import { arabicQuestion, arabicWords } from '../engine/arabic';
import { numberKey, questionKey } from '../engine/arabicSpeech';
import { factBar } from '../engine/guide';
import { FLUENT_LEVEL } from '../engine/mastery';
import { CheckupSession, expectedAnswer, PracticeSession, type Question } from '../engine/session';
import { isProductAnswer, type AnswerPayload } from '../engine/types';
import { newId } from '../data/api';
import { n, t } from '../i18n';
import { navigate } from '../router';
import { playArabic, stopArabic } from './arabicVoice';
import { Guide, type GuideMode } from './Guide';
import { useLearner } from './LearnerContext';
import { NumberPad } from './NumberPad';
import { SayAgain, SoundToggle, spokenQuestion, stopSpeaking, useReadAloud } from './ReadAloud';
import { Summary } from './Summary';

type Phase =
  | { kind: 'intro' }
  | { kind: 'ask'; q: Question }
  | { kind: 'guide'; q: Question; mode: GuideMode }
  | { kind: 'feedback'; q: Question; given: number | null; correct: boolean }
  | { kind: 'reveal'; q: Question }
  | { kind: 'turnaround'; q: Question }
  /** Bilingual mode, first time: how Arabic says numbers (the ones first). */
  | { kind: 'words'; q: Question }
  | { kind: 'break' }
  | { kind: 'summary' };

const FEEDBACK_MS = 450;
/** Long enough to read (and hear) the answer in Arabic words. */
const BILINGUAL_FEEDBACK_MS = 2200;
const MAX_DIGITS = 3;
const HARD_KINDS = ['new', 'learning', 'retry', 'repeat'];

export function Practice() {
  const { state, settings, addEvents, events } = useLearner();
  const { say, sayArabic } = useReadAloud();

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
  const askedAt = useRef(0);
  const startedAt = useRef(Date.now());
  const started = useRef(false);
  const ended = useRef(false);
  const lastBreakAt = useRef(0);
  const mistakes = useRef(new Map<string, number>());
  // Orientations answered so far ("7x3"), and whether the turnaround tip has been shown.
  const [seenOrientations] = useState(
    () =>
      new Set(
        events
          .filter((e) => e.type === 'answer' && isProductAnswer(e.payload as AnswerPayload))
          .map((e) => {
            const p = e.payload as AnswerPayload;
            return `${p.a}x${p.b}`;
          }),
      ),
  );
  const turnaroundShown = useRef(
    events.some((e) => e.type === 'tip_shown' && (e.payload as { tip?: string }).tip === 'turnaround'),
  );
  const isTurnedAround = (q: Question) =>
    // Pick a clearly non-square fact (like 3 × 7), so the turn is easy to see.
    q.form !== 'missing' &&
    Math.abs(q.a - q.b) >= 2 &&
    Math.min(q.a, q.b) >= 2 &&
    seenOrientations.has(`${q.b}x${q.a}`) &&
    !seenOrientations.has(`${q.a}x${q.b}`);
  const showBars = settings.pictureHints !== 'off';
  // Bilingual mode: practice questions (not the check-up, not missing-number puzzles) come in Arabic words.
  const isBilingual = (q: Question) => settings.bilingual && !isCheckup && q.form !== 'missing';
  const unitsTipShown = useRef(
    events.some((e) => e.type === 'tip_shown' && (e.payload as { tip?: string }).tip === 'unitsFirst'),
  );

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
    if (q.showStrategyFirst) {
      addEvents([{ type: 'strategy_viewed', payload: { a: q.a, b: q.b, sessionId: session.sessionId } }]);
      setPhase({ kind: 'guide', q, mode: 'new' });
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

  // Time each question from the moment it's on screen (a guide for a new fact counts too).
  useEffect(() => {
    if (phase.kind === 'ask' || (phase.kind === 'guide' && phase.mode === 'new')) askedAt.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind]);

  // Read the question aloud. Listening takes time, so if nothing has been typed yet when the
  // voice finishes, the clock starts from there.
  const askedQ = phase.kind === 'ask' ? phase.q : null;
  const inputRef = useRef(input);
  inputRef.current = input;
  const sayQuestion = useCallback(
    (q: Question, onEnd?: () => void) => {
      if (isBilingual(q)) sayArabic([questionKey(q)], onEnd);
      else say(spokenQuestion(q), onEnd, questionKey(q));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sayArabic, say, settings.bilingual],
  );
  useEffect(() => {
    if (!askedQ) return;
    sayQuestion(askedQ, () => {
      if (inputRef.current === '') askedAt.current = Math.max(askedAt.current, performance.now());
    });
    return () => {
      stopSpeaking();
      stopArabic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedQ]);

  const record = useCallback(
    (q: Question, given: number | null, hintUsed: boolean) => {
      const res = session.record(q, {
        given,
        latencyMs: performance.now() - askedAt.current,
        hintUsed,
        bilingual: isBilingual(q),
      });
      addEvents(res.events);
      if (q.form !== 'missing') seenOrientations.add(`${q.a}x${q.b}`);
      return res;
    },
    [addEvents, seenOrientations, session],
  );

  const submit = useCallback(
    (given: number | null) => {
      if (phase.kind !== 'ask') return;
      const q = phase.q;
      const turnedAround = !isCheckup && !turnaroundShown.current && isTurnedAround(q);
      const res = record(q, given, false);
      if (res.correct && turnedAround) {
        // First time they've got a fact right the other way round: show why that works.
        turnaroundShown.current = true;
        setPhase({ kind: 'feedback', q, given, correct: true });
        window.setTimeout(() => {
          addEvents([{ type: 'tip_shown', payload: { tip: 'turnaround', a: q.a, b: q.b, sessionId: session.sessionId } }]);
          setPhase({ kind: 'turnaround', q });
        }, FEEDBACK_MS);
        return;
      }
      if (res.correct && isBilingual(q)) {
        // Hear and see the answer in Arabic words. The first time, show how Arabic says numbers.
        const p = q.a * q.b;
        setPhase({ kind: 'feedback', q, given, correct: true });
        sayArabic([numberKey(p)]);
        const tip = !unitsTipShown.current && p > 20 && p % 10 !== 0;
        window.setTimeout(() => {
          if (!tip) return advance();
          unitsTipShown.current = true;
          addEvents([{ type: 'tip_shown', payload: { tip: 'unitsFirst', a: q.a, b: q.b, sessionId: session.sessionId } }]);
          setPhase({ kind: 'words', q });
        }, BILINGUAL_FEEDBACK_MS);
        return;
      }
      if (isCheckup || res.correct) {
        setPhase({ kind: 'feedback', q, given, correct: res.correct });
        window.setTimeout(advance, isCheckup ? 300 : FEEDBACK_MS);
        return;
      }
      // A first slip on a fact they already know: just show the answer (with an optional walkthrough).
      // Otherwise, work it out together.
      const count = (mistakes.current.get(q.key) ?? 0) + 1;
      mistakes.current.set(q.key, count);
      // (A missing-number slip is always worked out together: it's a new skill.)
      const known = startState.facts[q.key].level >= FLUENT_LEVEL && q.form !== 'missing';
      if (known && count === 1) setPhase({ kind: 'reveal', q });
      else {
        addEvents([{ type: 'strategy_viewed', payload: { a: q.a, b: q.b, sessionId: session.sessionId } }]);
        setPhase({ kind: 'guide', q, mode: 'mistake' });
      }
    },
    [addEvents, advance, isCheckup, phase, record, session.sessionId, startState],
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
      if (next.length >= String(expectedAnswer(phase.q)).length) submit(Number(next));
    },
    [input, phase, submit],
  );

  // Physical keyboard support (the guide handles its own keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') {
        if (phase.kind === 'ask') press('enter');
        else if (phase.kind === 'reveal') advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, phase, press]);

  const onGuideFinish = useCallback(
    (firstFinalTry: number) => {
      if (phase.kind !== 'guide') return;
      // For a new fact or a hint, the guide's last step *is* the answer to the question.
      if (phase.mode !== 'mistake') record(phase.q, firstFinalTry, true);
      advance();
    },
    [advance, phase, record],
  );

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

  // A picture of a missing-number question would let the hidden number be counted, so none there.
  const alwaysPicture =
    settings.pictureHints === 'always' &&
    phase.kind === 'ask' &&
    HARD_KINDS.includes(phase.q.kind) &&
    phase.q.form !== 'missing';

  const answerBox = (phase.kind === 'ask' || phase.kind === 'feedback') && (
    <span
      className={`answer-box num ${phase.kind === 'feedback' ? (isCheckup ? 'neutral' : 'good') : 'active'}`}
      aria-label={t('common.yourAnswer')}
    >
      {phase.kind === 'feedback' ? (phase.given == null ? '–' : n(phase.given)) : n(input)}
    </span>
  );

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
        {(phase.kind === 'ask' || phase.kind === 'feedback') && (
          <SayAgain text={spokenQuestion(phase.q)} clip={questionKey(phase.q)} arabic={isBilingual(phase.q)} />
        )}
        <SoundToggle />
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

      {phase.kind === 'guide' && (
        <Guide
          key={`${phase.q.key}-${phase.mode}-${session.answered}`}
          a={phase.q.a}
          b={phase.q.b}
          mode={phase.mode}
          showBars={showBars}
          onFinish={onGuideFinish}
          missing={phase.q.form === 'missing' ? phase.q.missing : undefined}
          intro={phase.q.form === 'missing' && phase.q.showStrategyFirst && phase.mode === 'new'}
        />
      )}

      {phase.kind === 'turnaround' && (
        <div className="panel">
          <p className="kicker">{t('turnaround.kicker')}</p>
          <p className="muted">{t('turnaround.intro')}</p>
          <TurnaroundShow a={phase.q.b} b={phase.q.a} />
          <button className="btn btn-primary btn-big" onClick={advance}>
            {t('common.gotIt')}
          </button>
        </div>
      )}

      {phase.kind === 'words' && (
        <div className="panel">
          <p className="kicker">{t('bilingual.kicker')}</p>
          <p className="muted">{t('bilingual.intro')}</p>
          <NumberWordsShow n={phase.q.a * phase.q.b} say={sayArabic} />
          <button className="btn btn-primary btn-big" onClick={advance}>
            {t('common.gotIt')}
          </button>
        </div>
      )}

      {phase.kind === 'reveal' && (
        <div className="panel">
          <p className="fact num" dir="ltr">
            {t('practice.reveal', { a: phase.q.a, b: phase.q.b, p: phase.q.a * phase.q.b })}
          </p>
          <p className="muted">{t('practice.revealNote')}</p>
          <button className="btn btn-primary btn-big" onClick={advance} autoFocus>
            {t('common.gotIt')}
          </button>
          <button className="btn btn-big" onClick={() => setPhase({ kind: 'guide', q: phase.q, mode: 'mistake' })}>
            {t('guide.showMe')}
          </button>
        </div>
      )}

      {(phase.kind === 'ask' || phase.kind === 'feedback') && (
        <>
          <div className="question-area">
            {phase.q.form === 'missing' ? (
              // ? × 7 = 56: the answer box sits in the gap.
              <div
                className="question question-missing num"
                aria-live="polite"
                dir="ltr"
                data-expr={phase.q.missing === 'a' ? `? × ${phase.q.b} = ${phase.q.a * phase.q.b}` : `${phase.q.a} × ? = ${phase.q.a * phase.q.b}`}
              >
                {phase.q.missing === 'a' ? answerBox : n(phase.q.a)}
                <span className="times">×</span>
                {phase.q.missing === 'b' ? answerBox : n(phase.q.b)}
                <span className="times">=</span>
                {n(phase.q.a * phase.q.b)}
              </div>
            ) : isBilingual(phase.q) ? (
              // Bilingual: the question in Arabic words; the answer in digits.
              <>
                <div
                  className="question question-words"
                  dir="rtl"
                  lang="ar"
                  aria-live="polite"
                  data-expr={`${phase.q.a} × ${phase.q.b}`}
                >
                  {arabicQuestion(phase.q.a, phase.q.b)}
                </div>
                <button className="btn btn-soft" onClick={() => playArabic([questionKey(phase.q)])}>
                  🔊 {t('bilingual.listen')}
                </button>
                {answerBox}
                <p className="answer-words" dir="rtl" lang="ar">
                  {phase.kind === 'feedback' && phase.correct ? arabicWords(phase.q.a * phase.q.b) : ''}
                </p>
              </>
            ) : (
              <>
                <div className="question num" aria-live="polite" dir="ltr" data-expr={`${phase.q.a} × ${phase.q.b}`}>
                  {n(phase.q.a)}
                  <span className="times">×</span>
                  {n(phase.q.b)}
                </div>
                {answerBox}
              </>
            )}
            {alwaysPicture && <BarModel bar={factBar(phase.q.a, phase.q.b)} compact />}
          </div>
          <div className="hint-row">
            {!isCheckup && phase.kind === 'ask' && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  addEvents([{ type: 'hint_shown', payload: { a: phase.q.a, b: phase.q.b, sessionId: session.sessionId } }]);
                  setPhase({ kind: 'guide', q: phase.q, mode: 'hint' });
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
