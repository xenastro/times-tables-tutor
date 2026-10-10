import { useCallback, useEffect, useRef, useState } from 'react';
import { pairsRound, type PairCard } from '../engine/games';
import { newId } from '../data/api';
import { n, t } from '../i18n';
import { goBack, navigate } from '../router';
import { useLearner } from './LearnerContext';
import { spokenExpr, useReadAloud } from './ReadAloud';

/**
 * "Find the pairs": tap a fact, then its answer. All cards face up, no timer, nothing to lose.
 * A wrong pair just wiggles and lets go.
 */
export function Pairs() {
  const { state, addEvents } = useLearner();
  const { say } = useReadAloud();
  const [round, setRound] = useState(0);
  const [cards, setCards] = useState<PairCard[]>(() => pairsRound(state));
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [nope, setNope] = useState<string[]>([]);
  const tries = useRef(0);
  const session = useRef({ id: newId(), startedAt: Date.now(), ended: false });

  const total = cards.length / 2;
  const done = matched.size === total;

  const startedRound = useRef(-1);
  useEffect(() => {
    // Once per round (effects run twice in development).
    if (startedRound.current === round) return;
    startedRound.current = round;
    session.current = { id: newId(), startedAt: Date.now(), ended: false };
    tries.current = 0;
    addEvents([{ type: 'session_start', payload: { sessionId: session.current.id, kind: 'game', game: 'pairs' } }]);
  }, [addEvents, round]);

  const end = useCallback(() => {
    if (session.current.ended || tries.current === 0) return;
    session.current.ended = true;
    addEvents([
      {
        type: 'session_end',
        payload: {
          sessionId: session.current.id,
          kind: 'game',
          game: 'pairs',
          answered: tries.current,
          correct: matched.size,
          durationMs: Date.now() - session.current.startedAt,
        },
      },
    ]);
  }, [addEvents, matched.size]);

  useEffect(() => {
    if (done) end();
  }, [done, end]);

  function tap(card: PairCard) {
    if (matched.has(card.pair) || nope.length) return;
    say(card.kind === 'fact' ? spokenExpr({ op: 'times', x: card.a, y: card.b }) : String(card.p));
    const first = cards.find((c) => c.id === selected);
    // Nothing chosen yet, the same card again, or two of the same kind: (re)choose this one.
    if (!first || first.id === card.id || first.kind === card.kind) {
      setSelected(first?.id === card.id ? null : card.id);
      return;
    }
    tries.current++;
    if (first.pair === card.pair) {
      setMatched((m) => new Set(m).add(card.pair));
      setSelected(null);
    } else {
      setNope([first.id, card.id]);
      window.setTimeout(() => {
        setNope([]);
        setSelected(null);
      }, 900);
    }
  }

  function again() {
    end();
    setCards(pairsRound(state));
    setMatched(new Set());
    setSelected(null);
    setRound((r) => r + 1);
  }

  return (
    <main className="screen">
      <header className="row">
        <button
          className="icon-btn"
          aria-label={t('common.back')}
          onClick={() => {
            end();
            goBack('/');
          }}
        >
          ←
        </button>
        <h1 style={{ fontSize: '1.4rem' }}>{t('games.pairsTitle')}</h1>
      </header>
      <p className="muted">{done ? t('games.pairsDone') : t('games.pairsHow')}</p>

      <div className="pairs-grid" aria-live="polite">
        {cards.map((c) => {
          const isMatched = matched.has(c.pair);
          const cls = [
            'pair-card',
            c.kind,
            selected === c.id ? 'selected' : '',
            isMatched ? 'matched' : '',
            nope.includes(c.id) ? 'nope' : '',
          ].join(' ');
          return (
            <button
              key={`${round}-${c.id}`}
              className={cls}
              aria-pressed={selected === c.id}
              disabled={isMatched}
              onClick={() => tap(c)}
              dir="ltr"
            >
              {c.kind === 'fact' ? `${n(c.a)} × ${n(c.b)}` : n(c.p)}
            </button>
          );
        })}
      </div>

      <p className="muted small" style={{ textAlign: 'center', minHeight: '1.4em' }}>
        {nope.length ? t('games.pairsNope') : t('games.pairsFound', { n: matched.size, total })}
      </p>

      {done && (
        <div className="stack">
          <button className="btn btn-primary btn-big" onClick={again}>
            {t('games.again')}
          </button>
          <button className="btn btn-big" onClick={() => navigate('/', { replace: true })}>
            {t('summary.home')}
          </button>
        </div>
      )}
    </main>
  );
}
