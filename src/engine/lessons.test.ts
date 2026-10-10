import { describe, expect, it } from 'vitest';
import { evaluate } from './guide';
import { lessonFor, LESSONS, nextLesson } from './lessons';

describe('Understand lessons', () => {
  it('are short, every step has one number to type, and pictures stay countable', () => {
    for (const id of LESSONS) {
      const l = lessonFor(id);
      expect(l.steps.length).toBeGreaterThanOrEqual(4);
      expect(l.steps.length).toBeLessThanOrEqual(6);
      for (const s of l.steps) {
        if (s.expr) expect(s.answer).toBe(evaluate(s.expr));
        expect(Number.isInteger(s.answer)).toBe(true);
        const p = s.picture;
        if (p.kind === 'groups') expect(p.groups * p.each).toBeLessThanOrEqual(12);
        if (p.kind === 'array') expect(p.rows * p.cols).toBeLessThanOrEqual(12);
        if (p.kind === 'line') expect(p.hops * p.step).toBeLessThanOrEqual(p.max);
      }
      // Each lesson ends by naming what was built as a multiplication.
      expect(l.steps.at(-1)!.expr?.op).toBe('times');
    }
  });

  it('builds the picture up one group, row or jump at a time', () => {
    const g = lessonFor('groups').steps.map((s) => (s.picture.kind === 'groups' ? s.picture.groups : 0));
    expect(g.slice(0, 3)).toEqual([1, 2, 3]);
    const line = lessonFor('skip2').steps.map((s) => (s.picture.kind === 'line' ? s.picture.hops : 0));
    expect(line).toEqual([1, 2, 3, 4, 5, 5]);
    // A jump's landing point isn't labelled until the learner has typed it.
    for (const s of lessonFor('skip5').steps) {
      if (s.picture.kind === 'line' && s.expr?.op === 'plus') expect(s.picture.landed).toBe(s.picture.hops - 1);
    }
  });

  it('go in order', () => {
    expect(nextLesson([])).toBe('groups');
    expect(nextLesson(['groups'])).toBe('arrays');
    expect(nextLesson(LESSONS)).toBeNull();
  });
});
