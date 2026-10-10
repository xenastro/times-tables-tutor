import { evaluate, type Expr } from './guide';

/**
 * The younger learners' "Understand" path: what multiplication *means*, before practising it.
 * Each lesson is a handful of baby steps; every step asks the learner to type one number, and
 * the picture grows one group, row or jump at a time so it can always be counted.
 */

export type LessonId = 'groups' | 'arrays' | 'skip10' | 'skip2' | 'skip5';

/** In teaching order. */
export const LESSONS: LessonId[] = ['groups', 'arrays', 'skip10', 'skip2', 'skip5'];

export type Picture =
  /** Plates with the same number of things on each. */
  | { kind: 'groups'; groups: number; each: number }
  /** Rows of squares; `turned` rotates it a quarter turn (rows become columns). */
  | { kind: 'array'; rows: number; cols: number; turned?: boolean }
  /** Jumps along a number line from 0. `landed` is how many landing points are labelled. */
  | { kind: 'line'; step: number; hops: number; landed: number; max: number };

export interface LessonStep {
  /** i18n key under `lesson.` and its variables. */
  text: string;
  vars: Record<string, number>;
  picture: Picture;
  /** Shown before the input box; null for "count them". */
  expr: Expr | null;
  answer: number;
}

export interface Lesson {
  id: LessonId;
  steps: LessonStep[];
}

const plus = (x: number, y: number): Expr => ({ op: 'plus', x, y });
const times = (x: number, y: number): Expr => ({ op: 'times', x, y });

function step(text: string, vars: Record<string, number>, picture: Picture, expr: Expr | null, count?: number): LessonStep {
  return { text, vars, picture, expr, answer: expr ? evaluate(expr) : count! };
}

function groups(): LessonStep[] {
  const g = (n: number, each = 2): Picture => ({ kind: 'groups', groups: n, each });
  return [
    step('groups_1', { each: 2 }, g(1), null, 2),
    step('groups_2', { each: 2 }, g(2), plus(2, 2)),
    step('groups_3', { each: 2 }, g(3), plus(4, 2)),
    step('groups_4', { n: 3, each: 2 }, g(3), times(3, 2)),
    step('groups_5', { n: 2, each: 5 }, g(2, 5), times(2, 5)),
  ];
}

function arrays(): LessonStep[] {
  const a = (rows: number, cols = 4, turned = false): Picture => ({ kind: 'array', rows, cols, turned });
  return [
    step('arrays_1', { cols: 4 }, a(1), null, 4),
    step('arrays_2', { cols: 4 }, a(2), plus(4, 4)),
    step('arrays_3', { cols: 4 }, a(3), plus(8, 4)),
    step('arrays_4', { rows: 3, cols: 4 }, a(3), times(3, 4)),
    step('arrays_5', { rows: 4, cols: 3 }, a(3, 4, true), times(4, 3)),
  ];
}

/** Count in `n`s along a number line, then name it as a multiplication. */
function skip(n: number, hops: number): LessonStep[] {
  const max = n * hops;
  const line = (h: number, landed: number): Picture => ({ kind: 'line', step: n, hops: h, landed, max });
  const out: LessonStep[] = [];
  for (let h = 1; h <= hops; h++) {
    out.push(step(h === 1 ? 'skip_first' : 'skip_next', { n }, line(h, h - 1), plus((h - 1) * n, n)));
  }
  out.push(step('skip_last', { hops, n }, line(hops, hops), times(hops, n)));
  return out;
}

export function lessonFor(id: LessonId): Lesson {
  switch (id) {
    case 'groups':
      return { id, steps: groups() };
    case 'arrays':
      return { id, steps: arrays() };
    case 'skip10':
      return { id, steps: skip(10, 4) };
    case 'skip2':
      return { id, steps: skip(2, 5) };
    case 'skip5':
      return { id, steps: skip(5, 4) };
  }
}

/** The first lesson not yet done, or null when the path is finished. */
export function nextLesson(done: Iterable<string>): LessonId | null {
  const d = new Set(done);
  return LESSONS.find((l) => !d.has(l)) ?? null;
}
