import { describe, expect, it } from 'vitest';
import { allFacts } from './facts';
import { pairsRound, PAIRS_PER_ROUND, RowGame, rowChoices } from './games';
import { deriveState } from './mastery';
import { withDefaults, type TutorEvent } from './types';

function seededRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const T0 = new Date(2026, 9, 1, 17, 0).getTime();
const settings = withDefaults(null);

function checkup(keys: string[]): TutorEvent[] {
  return keys.map((key, i) => {
    const [a, b] = key.split('x').map(Number);
    return {
      id: `e${i}`,
      learnerId: 'L',
      type: 'answer',
      ts: T0 + i,
      payload: { a, b, given: a * b, correct: true, latencyMs: 1500, mode: 'checkup', hinted: false, sessionId: 's' },
    };
  });
}

describe('pairs game', () => {
  it('deals six facts and their products, all different, mostly known', () => {
    const known = allFacts(10).filter((f) => f.a >= 2 && f.a <= 5).map((f) => f.key);
    const state = deriveState(checkup(known), settings);
    for (let seed = 1; seed < 30; seed++) {
      const cards = pairsRound(state, seededRng(seed));
      expect(cards).toHaveLength(PAIRS_PER_ROUND * 2);
      const products = cards.filter((c) => c.kind === 'product').map((c) => c.p);
      expect(new Set(products).size).toBe(PAIRS_PER_ROUND);
      for (const c of cards) {
        expect(c.p).toBe(c.a * c.b);
        expect(Math.min(c.a, c.b)).toBeGreaterThanOrEqual(2);
        expect(cards.filter((x) => x.pair === c.pair)).toHaveLength(2);
      }
    }
  });

  it('still works for a brand-new learner', () => {
    const cards = pairsRound(deriveState([], settings), seededRng(3));
    expect(cards.length).toBeGreaterThanOrEqual(8);
  });
});

describe('fill-a-row game', () => {
  it('asks every fact in the row once when all are right', () => {
    const g = new RowGame(7, 10, seededRng(4));
    const seen: number[] = [];
    while (!g.done) {
      const q = g.current!;
      expect(q.a).toBe(7);
      seen.push(q.k);
      expect(g.answer(q.a * q.b)).toEqual({ correct: true, needsGuide: false });
    }
    expect(seen.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(g.filled.size).toBe(10);
  });

  it('brings a miss back later, and offers a guide after a second miss', () => {
    const g = new RowGame(6, 10, seededRng(5));
    const first = g.current!.k;
    expect(g.answer(1).needsGuide).toBe(false);
    expect(g.current!.k).not.toBe(first);
    while (g.current!.k !== first) g.answer(g.current!.a * g.current!.b);
    expect(g.answer(2).needsGuide).toBe(true);
    g.solvedWithGuide(first);
    expect(g.done).toBe(true);
    expect(g.filled.size).toBe(10);
  });

  it('offers ×2, ×5 and ×10 rows to a younger learner', () => {
    const young = withDefaults({ profile: 'young' });
    expect(rowChoices(deriveState([], young), young).map((r) => r.table)).toEqual([2, 5, 10]);
    expect(rowChoices(deriveState([], settings), settings)).toHaveLength(9);
  });
});
