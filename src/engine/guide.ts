import { homeTable, otherFactor } from './facts';

/**
 * Step-by-step "work it out together" guides. Each step asks the learner for one small
 * in-between answer; the last step asks the fact itself.
 *
 * Numbers keep their place: for "5 × 3" the ×10 step is "10 × 3", for "3 × 5" it is "3 × 10".
 */

export type Tone = 'a' | 'b' | 'removed' | 'faded';

/** A bar model: `segments.length` blocks, each worth `size`. */
export interface Bar {
  size: number;
  segments: Tone[];
}

export type Expr =
  | { op: 'times'; x: number; y: number; /** The factor that was swapped in (for the swap animation). */ from?: { pos: 'x' | 'y'; value: number } }
  | { op: 'plus'; x: number; y: number }
  | { op: 'minus'; x: number; y: number }
  | { op: 'half'; x: number };

export interface GuideStep {
  /** i18n key under `guide.` and its variables. */
  text: string;
  vars: Record<string, number>;
  expr: Expr;
  answer: number;
  bar: Bar;
  /** Optional extra tip (i18n key under `guide.`). */
  note?: string;
}

export type GuideKind =
  | 'times1'
  | 'times10'
  | 'double'
  | 'halfOf10'
  | 'tenPlusOne'
  | 'tenMinusOne'
  | 'doubleDouble'
  | 'doublePlusOne'
  | 'tenPlusTwo'
  | 'doubleThreeTimes'
  | 'fivePlusOne'
  | 'fivePlusTwo';

export interface Guide {
  kind: GuideKind;
  /** The fact as displayed. */
  a: number;
  b: number;
  steps: GuideStep[];
}

export function evaluate(e: Expr): number {
  switch (e.op) {
    case 'times':
      return e.x * e.y;
    case 'plus':
      return e.x + e.y;
    case 'minus':
      return e.x - e.y;
    case 'half':
      return e.x / 2;
  }
}

const tones = (...runs: [Tone, number][]): Tone[] => runs.flatMap(([t, n]) => Array<Tone>(n).fill(t));
const bar = (size: number, ...runs: [Tone, number][]): Bar => ({ size, segments: tones(...runs) });

export function guideFor(a: number, b: number): Guide {
  const h = homeTable(a, b);
  const n = otherFactor(a, b);
  const p = a * b;
  // Replace the home factor with `k`, keeping its position.
  const swap = (k: number): Expr =>
    h === a ? { op: 'times', x: k, y: b, from: { pos: 'x', value: a } } : { op: 'times', x: a, y: k, from: { pos: 'y', value: b } };
  const plus = (x: number, y: number): Expr => ({ op: 'plus', x, y });
  const step = (text: string, vars: Record<string, number>, expr: Expr, b2: Bar, note?: string): GuideStep => ({
    text,
    vars,
    expr,
    answer: evaluate(expr),
    bar: b2,
    ...(note ? { note } : {}),
  });
  const final = (b2: Bar, note?: string): GuideStep => step('final', { a, b, p }, { op: 'times', x: a, y: b }, b2, note);

  let kind: GuideKind;
  let steps: GuideStep[];

  // 7 × 8 is taught through ×8 doubling, with the 5-6-7-8 trick as a memory hook.
  const isSevenEight = p === 56 && (a === 7 || a === 8);
  const table = isSevenEight ? 8 : h;
  const m = isSevenEight ? 7 : n;

  switch (table) {
    case 1:
      kind = 'times1';
      steps = [step('times1', { n: m }, { op: 'times', x: a, y: b }, bar(m, ['a', 1]))];
      break;
    case 10:
      kind = 'times10';
      steps = [step('times10', { n: m }, { op: 'times', x: a, y: b }, bar(10, ['a', m]), 'tenTrick')];
      break;
    case 2:
      kind = 'double';
      steps = [step('double', { n: m }, plus(m, m), bar(m, ['a', 1], ['b', 1])), final(bar(m, ['a', 1], ['b', 1]))];
      break;
    case 5: {
      kind = 'halfOf10';
      const ten = 10 * m;
      const note = m % 2 ? 'halfOdd' : undefined;
      steps = [
        step('halfOf10_1', { n: m }, swap(10), bar(m, ['a', 10])),
        step('halfOf10_2', { ten, evenTen: ten - 10, halfEven: (ten - 10) / 2 }, { op: 'half', x: ten }, bar(m, ['a', 5], ['faded', 5]), note),
        final(bar(m, ['a', 5])),
      ];
      break;
    }
    case 11: {
      kind = 'tenPlusOne';
      const ten = 10 * m;
      steps = [
        step('tenPlusOne_1', { n: m }, swap(10), bar(m, ['a', 10])),
        step('tenPlusOne_2', { n: m, ten }, plus(ten, m), bar(m, ['a', 10], ['b', 1])),
        final(bar(m, ['a', 10], ['b', 1]), m <= 9 ? 'elevenTrick' : undefined),
      ];
      break;
    }
    case 9: {
      kind = 'tenMinusOne';
      const ten = 10 * m;
      steps = [
        step('tenMinusOne_1', { n: m }, swap(10), bar(m, ['a', 10])),
        step('tenMinusOne_2', { n: m, ten }, { op: 'minus', x: ten, y: m }, bar(m, ['a', 9], ['removed', 1])),
        final(bar(m, ['a', 9]), m <= 9 ? 'nineTrick' : undefined),
      ];
      break;
    }
    case 4:
      kind = 'doubleDouble';
      steps = [
        step('doubleDouble_1', { n: m }, plus(m, m), bar(m, ['a', 2])),
        step('doubleDouble_2', { d1: 2 * m }, plus(2 * m, 2 * m), bar(m, ['a', 2], ['b', 2])),
        final(bar(m, ['a', 2], ['b', 2])),
      ];
      break;
    case 3:
      kind = 'doublePlusOne';
      steps = [
        step('doublePlusOne_1', { n: m }, plus(m, m), bar(m, ['a', 2])),
        step('doublePlusOne_2', { n: m, d1: 2 * m }, plus(2 * m, m), bar(m, ['a', 2], ['b', 1])),
        final(bar(m, ['a', 2], ['b', 1])),
      ];
      break;
    case 12: {
      kind = 'tenPlusTwo';
      const ten = 10 * m;
      steps = [
        step('tenPlusTwo_1', { n: m }, swap(10), bar(m, ['a', 10])),
        step('tenPlusTwo_2', { n: m }, plus(m, m), bar(m, ['faded', 10], ['b', 2])),
        step('tenPlusTwo_3', { ten, two: 2 * m }, plus(ten, 2 * m), bar(m, ['a', 10], ['b', 2])),
        final(bar(m, ['a', 10], ['b', 2])),
      ];
      break;
    }
    case 8:
      kind = 'doubleThreeTimes';
      steps = [
        step('doubleThreeTimes_1', { n: m }, plus(m, m), bar(m, ['a', 2])),
        step('doubleThreeTimes_2', { d1: 2 * m }, plus(2 * m, 2 * m), bar(m, ['a', 2], ['b', 2])),
        step('doubleThreeTimes_3', { d2: 4 * m }, plus(4 * m, 4 * m), bar(m, ['a', 4], ['b', 4])),
        final(bar(m, ['a', 8]), isSevenEight ? 'sevenEightTrick' : undefined),
      ];
      break;
    case 6: {
      kind = 'fivePlusOne';
      const five = 5 * m;
      steps = [
        step('fivePlusOne_1', { n: m }, swap(5), bar(m, ['a', 5])),
        step('fivePlusOne_2', { n: m, five }, plus(five, m), bar(m, ['a', 5], ['b', 1])),
        final(bar(m, ['a', 5], ['b', 1])),
      ];
      break;
    }
    case 7:
    default: {
      kind = 'fivePlusTwo';
      const five = 5 * m;
      steps = [
        step('fivePlusTwo_1', { n: m }, swap(5), bar(m, ['a', 5])),
        step('fivePlusTwo_2', { n: m }, plus(m, m), bar(m, ['faded', 5], ['b', 2])),
        step('fivePlusTwo_3', { five, two: 2 * m }, plus(five, 2 * m), bar(m, ['a', 5], ['b', 2])),
        final(bar(m, ['a', 5], ['b', 2])),
      ];
    }
  }
  return { kind, a, b, steps };
}

/** The picture of the fact itself: `home` groups of `other`. */
export function factBar(a: number, b: number): Bar {
  const h = homeTable(a, b);
  const n = otherFactor(a, b);
  if (h === 10) return bar(10, ['a', n]);
  return bar(n, ['a', h]);
}
