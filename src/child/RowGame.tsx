import { useCallback, useEffect, useRef, useState } from 'react';
import { RowGame, rowChoices } from '../engine/games';
import { newId } from '../data/api';
import { n, t } from '../i18n';
import { goBack, navigate } from '../router';
import { Guide } from './Guide';
import { useLearner } from './LearnerContext';
import { NumberPad } from './NumberPad';
import { SayAgain, spokenExpr, useReadAloud } from './ReadAloud';

/** "Fill a row": pick a row of the map, then fill every cell. A miss comes back later; nothing is lost. */
export function RowGameScreen() {
  const [table, setTable] = useState<number | null>(null);
  return table === null ? <RowPicker onPick={setTable} /> : <RowPlay key={table} table={table} onAnother={() => setTable(null)} />;
}

function RowPicker({ onPick }: { onPick: (table: number) => void }) {
  const { state, settings } = useLearner();
  const rows = rowChoices(state, settings);
  return (
    <main className="screen">
      <header className="row">
        <button className="icon-btn" aria-label={t('common.back')} onClick={() => goBack('/')}>
          <span className="flip-rtl">←</span>
        </button>
        <h1 style={{ fontSize: '1.4rem' }}>{t('games.rowTitle')}</h1>
      </header>
      <p className="muted">{t('games.rowPick')}</p>
      <div className="row-picker">
        {rows.map((r) => (
          <button key={r.table} className="row-choice" onClick={() => onPick(r.table)} aria-label={t('games.rowChoice', { n: r.table })}>
            <span className="num" dir="ltr">
              ×{n(r.table)}
            </span>
            <span className="row-choice-bar" aria-hidden="true">
              <i style={{ width: `${(r.fluent / r.total) * 100}%` }} />
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}

type Phase =
  | { kind: 'ask' }
  | { kind: 'feedback'; good: boolean; given: number; a: number; b: number; k: number }
  | { kind: 'guide'; k: number }
  | { kind: 'done' };

function RowPlay({ table, onAnother }: { table: number; onAnother: () => void }) {
  const { state, addEvents } = useLearner();
  const { say } = useReadAloud();
  const [game] = useState(() => new RowGame(table, state.activeMax));
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' });
  const [input, setInput] = useState('');
  const [popped, setPopped] = useState<number | null>(null);
  const session = useRef({ id: newId(), startedAt: Date.now(), started: false, ended: false });

  useEffect(() => {
    if (session.current.started) return;
    session.current.started = true;
    addEvents([{ type: 'session_start', payload: { sessionId: session.current.id, kind: 'game', game: 'row', table } }]);
  }, [addEvents, table]);

  const end = useCallback(() => {
    const s = session.current;
    if (s.ended || game.answered === 0) return;
    s.ended = true;
    addEvents([
      {
        type: 'session_end',
        payload: {
          sessionId: s.id,
          kind: 'game',
          game: 'row',
          table,
          answered: game.answered,
          correct: game.correct,
          durationMs: Date.now() - s.startedAt,
        },
      },
    ]);
  }, [addEvents, game, table]);

  // While showing feedback, keep the question that was just answered on screen.
  const q = phase.kind === 'feedback' ? phase : game.current;
  const next = useCallback(() => {
    setInput('');
    if (game.done) {
      end();
      setPhase({ kind: 'done' });
    } else setPhase({ kind: 'ask' });
  }, [end, game]);

  // Read each question aloud.
  const asking = phase.kind === 'ask' && q ? `${q.a}x${q.b}-${game.answered}` : null;
  useEffect(() => {
    if (asking && q) say(spokenExpr({ op: 'times', x: q.a, y: q.b }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking]);

  const submit = useCallback(
    (given: number) => {
      if (phase.kind !== 'ask' || !q) return;
      const res = game.answer(given);
      if (res.correct) setPopped(q.k);
      if (res.needsGuide) {
        setPhase({ kind: 'guide', k: q.k });
        return;
      }
      setPhase({ kind: 'feedback', good: res.correct, given, ...q });
      window.setTimeout(next, res.correct ? 500 : 1400);
    },
    [game, next, phase.kind, q],
  );

  const press = useCallback(
    (key: string) => {
      if (phase.kind !== 'ask' || !q) return;
      if (key === 'back') return setInput((s) => s.slice(0, -1));
      if (key === 'enter') {
        if (input) submit(Number(input));
        return;
      }
      const v = (input + key).replace(/^0+(?=\d)/, '').slice(0, 3);
      setInput(v);
      if (v.length >= String(q.a * q.b).length) submit(Number(v));
    },
    [input, phase.kind, q, submit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('enter');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const cols = game.max / 2;
  const tiles = (
    <div className={`row-tiles${phase.kind === 'done' ? ' pattern' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} dir="ltr">
      {Array.from({ length: game.max }, (_, i) => {
        const k = i + 1;
        const filled = game.filled.has(k);
        const current = phase.kind !== 'done' && q?.k === k;
        return (
          <div
            key={k}
            className={`row-tile${filled ? ' filled' : ''}${current ? ' current' : ''}${popped === k ? ' pop' : ''}`}
            style={{ '--i': i } as React.CSSProperties}
            aria-label={filled ? `${table} × ${k} = ${table * k}` : `${table} × ${k}`}
          >
            <small className="num">
              {n(table)}×{n(k)}
            </small>
            <strong className="num">{filled ? n(table * k) : ''}</strong>
            {phase.kind === 'done' && k > 1 && <em className="row-plus">+{n(table)}</em>}
          </div>
        );
      })}
    </div>
  );

  if (phase.kind === 'guide') {
    return (
      <main className="practice">
        <div className="practice-top" />
        <Guide
          key={phase.k}
          a={table}
          b={phase.k}
          mode="mistake"
          showBars
          onFinish={() => {
            game.solvedWithGuide(phase.k);
            setPopped(phase.k);
            next();
          }}
        />
      </main>
    );
  }

  return (
    <main className="practice">
      <div className="practice-top">
        <button
          className="icon-btn"
          aria-label={t('common.back')}
          onClick={() => {
            end();
            goBack('/');
          }}
        >
          <span className="flip-rtl">←</span>
        </button>
        <h1 className="grow" style={{ fontSize: '1.2rem' }}>
          {t('games.rowPlaying', { n: table })}
        </h1>
        {phase.kind === 'ask' && q && <SayAgain text={spokenExpr({ op: 'times', x: q.a, y: q.b })} />}
      </div>
      {tiles}

      {phase.kind === 'done' ? (
        <div className="panel">
          <p className="strategy-text" style={{ textAlign: 'center' }}>
            {t('games.rowDone', { n: table })}
          </p>
          <p className="muted" style={{ textAlign: 'center' }}>
            {t('games.rowPattern', { n: table })}
          </p>
          <button className="btn btn-primary btn-big" onClick={onAnother}>
            {t('games.rowAnother')}
          </button>
          <button className="btn btn-big" onClick={() => navigate('/', { replace: true })}>
            {t('summary.home')}
          </button>
        </div>
      ) : (
        q && (
          <>
            <div className="question-area">
              <div className="question question-row num" dir="ltr" data-expr={`${q.a} × ${q.b}`}>
                {n(q.a)}
                <span className="times">×</span>
                {n(q.b)}
              </div>
              <span
                className={`answer-box num ${phase.kind === 'feedback' ? (phase.good ? 'good' : 'neutral') : 'active'}`}
                aria-label={t('common.yourAnswer')}
              >
                {phase.kind === 'feedback' ? n(phase.given) : n(input)}
              </span>
            </div>
            <p className="muted" style={{ textAlign: 'center', minHeight: '1.5em' }} role="status">
              {phase.kind === 'feedback' && !phase.good ? t('games.rowNotYet') : ''}
            </p>
            <NumberPad onPress={press} disabled={phase.kind !== 'ask'} canSubmit={input.length > 0} />
          </>
        )
      )}
    </main>
  );
}
