import { activeFacts, FLUENT_LEVEL, type LearnerState } from './mastery';
import type { LearnerSettings } from './types';

/**
 * Low-pressure games. No timers, no scores against anyone, no way to lose. Game answers are
 * kept out of the fact levels: matching shows the answers, and filling one row asks the same
 * table over and over, so neither says much about recall in mixed practice.
 */

type Rng = () => number;

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ Pairs */

export interface PairCard {
  id: string;
  /** Cards with the same `pair` match. */
  pair: number;
  kind: 'fact' | 'product';
  a: number;
  b: number;
  p: number;
}

export const PAIRS_PER_ROUND = 6;

/**
 * A round of "find the pairs": each fact card (7 × 8) has one product card (56).
 * Mostly facts the learner already knows, every product different, ×1 left out (too easy to be fun).
 */
export function pairsRound(state: LearnerState, rng: Rng = Math.random, count = PAIRS_PER_ROUND): PairCard[] {
  const facts = activeFacts(state).filter((f) => Math.min(f.a, f.b) >= 2);
  const known = shuffle(facts.filter((f) => f.level >= 2), rng);
  const learning = shuffle(facts.filter((f) => f.level === 1), rng);
  // Easy ones anyone can do, in case the map is still mostly empty.
  const easy = shuffle(facts.filter((f) => f.level === 0 && (f.a === 2 || f.a === 10 || f.b === 10)), rng);
  // About one in three can be a fact that's still being learned.
  const wantLearning = Math.min(learning.length, Math.floor(count / 3));
  const ordered = [...learning.slice(0, wantLearning), ...known, ...learning.slice(wantLearning), ...easy];

  const products = new Set<number>();
  const chosen: { a: number; b: number }[] = [];
  for (const f of ordered) {
    if (chosen.length >= count) break;
    if (products.has(f.a * f.b)) continue;
    products.add(f.a * f.b);
    chosen.push(rng() < 0.5 ? { a: f.a, b: f.b } : { a: f.b, b: f.a });
  }

  const cards: PairCard[] = chosen.flatMap((f, i) => [
    { id: `f${i}`, pair: i, kind: 'fact' as const, a: f.a, b: f.b, p: f.a * f.b },
    { id: `p${i}`, pair: i, kind: 'product' as const, a: f.a, b: f.b, p: f.a * f.b },
  ]);
  return shuffle(cards, rng);
}

/* ------------------------------------------------------------------ Fill a row */

export interface RowChoice {
  table: number;
  /** How many facts in this row are already fluent (for a calm "how full is it" hint). */
  fluent: number;
  total: number;
}

/** Rows a learner can choose to fill: the younger profile sticks to ×2, ×5 and ×10. */
export function rowChoices(state: LearnerState, settings: LearnerSettings): RowChoice[] {
  const max = state.activeMax;
  const tables = settings.profile === 'young' ? [2, 5, 10] : Array.from({ length: max - 1 }, (_, i) => i + 2);
  return tables.map((table) => {
    let fluent = 0;
    for (let k = 1; k <= max; k++) {
      const key = table <= k ? `${table}x${k}` : `${k}x${table}`;
      if ((state.facts[key]?.level ?? 0) >= FLUENT_LEVEL) fluent++;
    }
    return { table, fluent, total: max };
  });
}

/**
 * Plays one row of the map: every fact `table × k` for k = 1..max, in a shuffled order.
 * A miss goes to the back of the queue; a second miss on the same fact asks for a guide first.
 */
export class RowGame {
  readonly table: number;
  readonly max: number;
  /** Filled cells, by k. */
  readonly filled = new Set<number>();
  private queue: number[];
  private misses = new Map<number, number>();
  answered = 0;
  correct = 0;

  constructor(table: number, max: number, rng: Rng = Math.random) {
    this.table = table;
    this.max = max;
    this.queue = shuffle(
      Array.from({ length: max }, (_, i) => i + 1),
      rng,
    );
  }

  get done(): boolean {
    return this.queue.length === 0;
  }

  /** The current question: `table × k`. */
  get current(): { a: number; b: number; k: number } | null {
    const k = this.queue[0];
    return k === undefined ? null : { a: this.table, b: k, k };
  }

  /** Records an answer to the current question. `needsGuide` means "work it out together next". */
  answer(given: number): { correct: boolean; needsGuide: boolean } {
    const q = this.current;
    if (!q) return { correct: false, needsGuide: false };
    this.answered++;
    this.queue.shift();
    if (given === q.a * q.b) {
      this.correct++;
      this.filled.add(q.k);
      return { correct: true, needsGuide: false };
    }
    const n = (this.misses.get(q.k) ?? 0) + 1;
    this.misses.set(q.k, n);
    // Back of the queue, so it comes again after a few others.
    this.queue.push(q.k);
    return { correct: false, needsGuide: n >= 2 };
  }

  /** After a guide: the learner has worked it out, so the cell fills and the fact leaves the queue. */
  solvedWithGuide(k: number) {
    this.queue = this.queue.filter((x) => x !== k);
    this.filled.add(k);
  }
}
