import { describe, expect, it } from 'vitest';
import { allFacts, factKey, groupOf, homeTable, teachingOrder } from './facts';
import { DAY, deriveState, FLUENT_LEVEL, fluentCount } from './mastery';
import { CheckupSession, PracticeSession, type Question } from './session';
import { evaluate, factBar, guideFor } from './guide';
import { trickFor, type TrickShow } from './tricks';
import { dailyStats, practiceDaysLast7, troubleFacts } from './stats';
import { withDefaults, type AnswerPayload, type LearnerSettings, type TutorEvent } from './types';

/* ---------- helpers ---------- */

function seededRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let idSeq = 0;
function ev(type: TutorEvent['type'], ts: number, payload: unknown): TutorEvent {
  return { id: `e${idSeq++}`, learnerId: 'L', type, ts, payload };
}

function answer(a: number, b: number, ts: number, opts: Partial<AnswerPayload> = {}): TutorEvent {
  return ev('answer', ts, {
    a,
    b,
    given: a * b,
    correct: true,
    latencyMs: 1500,
    mode: 'practice',
    hinted: false,
    sessionId: 's',
    ...opts,
  });
}

/** A simulated learner: knows some facts instantly, slowly learns others after seeing a strategy. */
function makeStudent(known: Set<string>, rng: () => number) {
  const learned = new Set<string>();
  return (q: Question) => {
    if (q.showStrategyFirst) learned.add(q.key);
    if (known.has(q.key)) return { given: q.a * q.b, latencyMs: 1200 + rng() * 800, hintUsed: false };
    if (learned.has(q.key) && rng() < 0.8) return { given: q.a * q.b, latencyMs: 3000 + rng() * 3000, hintUsed: false };
    // After a miss the app shows the answer and its picture, so the fact starts to stick.
    if (q.mode === 'practice') learned.add(q.key);
    return { given: q.a * q.b + 1, latencyMs: 6000, hintUsed: false };
  };
}

function runCheckup(settings: LearnerSettings, student: ReturnType<typeof makeStudent>, start: number) {
  const events: TutorEvent[] = [ev('session_start', start, { sessionId: 'c1', kind: 'checkup' })];
  const s = new CheckupSession(deriveState([], settings), settings, 'c1', seededRng(1));
  let t = start;
  let asked = 0;
  for (let q = s.next(); q; q = s.next()) {
    const r = s.record(q, student(q));
    asked++;
    for (const pe of r.events) events.push(ev(pe.type, (t += 5000), pe.payload));
  }
  return { events, asked };
}

function runPractice(events: TutorEvent[], settings: LearnerSettings, student: ReturnType<typeof makeStudent>, now: number, seed = 7) {
  const state = deriveState(events, settings);
  const s = new PracticeSession(state, settings, `p${now}`, now, seededRng(seed));
  const out: TutorEvent[] = [];
  const asked: Question[] = [];
  let t = now;
  for (let q = s.next(); q; q = s.next()) {
    asked.push(q);
    const r = s.record(q, student(q));
    for (const pe of r.events) out.push(ev(pe.type, (t += 5000), pe.payload));
  }
  out.push(ev('session_end', t, { sessionId: s.sessionId, kind: 'practice', answered: s.answered, correct: s.correctCount, durationMs: t - now }));
  return { session: s, events: out, asked };
}

const T0 = new Date(2026, 9, 1, 17, 0).getTime();

/* ---------- facts ---------- */

describe('facts', () => {
  it('treats 3×7 and 7×3 as one fact', () => {
    expect(factKey(7, 3)).toBe('3x7');
    expect(allFacts(10)).toHaveLength(55);
    expect(allFacts(12)).toHaveLength(78);
  });

  it('teaches easy tables first and bonus rows last', () => {
    const order = teachingOrder(allFacts(12)).map((f) => f.key);
    expect(groupOf(1, 1)).toBe(0);
    expect(groupOf(2, 7)).toBe(0); // ×2 is the home table for 2×7
    expect(groupOf(6, 7)).toBe(3);
    expect(groupOf(11, 3)).toBe(4);
    expect(order.indexOf('2x7')).toBeLessThan(order.indexOf('5x7'));
    expect(order.indexOf('5x7')).toBeLessThan(order.indexOf('4x7'));
    expect(order.indexOf('7x7')).toBeLessThan(order.indexOf('3x11'));
    expect(homeTable(9, 6)).toBe(9);
  });
});

/* ---------- guides ---------- */

describe('guides', () => {
  it('picks a sensible method for each hard fact', () => {
    expect(guideFor(6, 7).kind).toBe('fivePlusOne');
    expect(guideFor(7, 8).kind).toBe('doubleThreeTimes');
    expect(guideFor(7, 8).steps.at(-1)!.note).toBe('sevenEightTrick');
    expect(guideFor(7, 7).kind).toBe('fivePlusTwo');
    expect(guideFor(4, 6).kind).toBe('doubleDouble');
    expect(guideFor(9, 6).kind).toBe('tenMinusOne');
    expect(guideFor(12, 12).kind).toBe('tenPlusTwo');
  });

  it('keeps numbers in their place when swapping a factor', () => {
    expect(guideFor(5, 3).steps[0].expr).toMatchObject({ op: 'times', x: 10, y: 3 });
    expect(guideFor(3, 5).steps[0].expr).toMatchObject({ op: 'times', x: 3, y: 10 });
    expect(guideFor(7, 6).steps[0].expr).toMatchObject({ op: 'times', x: 7, y: 5 });
  });

  it('every step is correct arithmetic and every guide ends on the fact itself', () => {
    for (const f of allFacts(12)) {
      for (const [a, b] of [[f.a, f.b], [f.b, f.a]]) {
        const g = guideFor(a, b);
        for (const s of g.steps) {
          expect(s.answer).toBe(evaluate(s.expr));
          expect(Number.isInteger(s.answer)).toBe(true);
          expect(s.bar.segments.length).toBeLessThanOrEqual(12);
        }
        expect(g.steps.at(-1)!.answer).toBe(a * b);
        expect(g.steps.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('draws the fact as groups that add up to the product', () => {
    for (const f of allFacts(12)) {
      const bar = factBar(f.a, f.b);
      expect(bar.size * bar.segments.length).toBe(f.a * f.b);
    }
  });
});


/* ---------- animated tricks ---------- */

/** Read the main row of a frame left to right, skipping hidden tokens. */
function readRow(show: TrickShow, frameIndex: number): string {
  const f = show.frames[frameIndex];
  return show.tokens
    .filter((tok) => !f.tokens[tok.id].hidden && (f.tokens[tok.id].y ?? 0) === 0)
    .sort((p, q) => f.tokens[p.id].x - f.tokens[q.id].x)
    .map((tok) => tok.text)
    .join('');
}

describe('animated tricks', () => {
  const withTricks: [number, number, string][] = [];
  for (const f of allFacts(12)) {
    for (const [a, b] of [[f.a, f.b], [f.b, f.a]]) {
      const note = guideFor(a, b).steps.at(-1)!.note;
      if (note && trickFor(note, a, b)) withTricks.push([a, b, note]);
    }
  }

  it('exist for 7 × 8, ×10, ×11 and ×9 facts', () => {
    const notes = new Set(withTricks.map(([, , n]) => n));
    expect([...notes].sort()).toEqual(['elevenTrick', 'nineTrick', 'sevenEightTrick', 'tenTrick']);
  });

  it('end on the fact, in the order it was asked, and stay inside the frame', () => {
    for (const [a, b] of withTricks) {
      const show = trickFor(guideFor(a, b).steps.at(-1)!.note!, a, b)!;
      expect(readRow(show, show.frames.length - 1)).toBe(`${a}×${b}=${a * b}`);
      for (const f of show.frames) {
        for (const tok of show.tokens) {
          const s = f.tokens[tok.id];
          expect(s, `${a}×${b} ${tok.id}`).toBeDefined();
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.x).toBeLessThan(show.slots);
        }
      }
    }
  });

  it('keep the answer hidden at the start (except 7 × 8, which starts from the full fact)', () => {
    expect(readRow(trickFor('tenTrick', 7, 10)!, 0)).toBe('7×10=');
    expect(readRow(trickFor('tenTrick', 10, 12)!, 0)).toBe('10×12=');
    expect(readRow(trickFor('elevenTrick', 4, 11)!, 0)).toBe('4×11=');
    expect(readRow(trickFor('nineTrick', 9, 7)!, 0)).toBe('9×7=63');
  });
});

/* ---------- mastery ---------- */

describe('deriveState', () => {
  const settings = withDefaults(null);

  it('counts a fluent check-up answer as fluent and a miss as new', () => {
    const s = deriveState(
      [
        answer(3, 7, T0, { mode: 'checkup' }),
        answer(6, 8, T0 + 1, { mode: 'checkup', correct: false, given: 46 }),
        answer(4, 7, T0 + 2, { mode: 'checkup', latencyMs: 9000 }),
      ],
      settings,
    );
    expect(s.facts['3x7'].level).toBe(FLUENT_LEVEL);
    expect(s.facts['6x8'].level).toBe(0);
    expect(s.facts['4x7'].level).toBe(1);
  });

  it('only moves a fact up when the review was actually due', () => {
    const events = [answer(6, 7, T0, { mode: 'checkup', correct: false, given: 1 })];
    events.push(answer(6, 7, T0 + 1000, { hinted: true })); // seen with strategy card → learning
    events.push(answer(6, 7, T0 + 2000)); // fluent → level 2, due tomorrow
    events.push(answer(6, 7, T0 + 3000)); // fluent again same day → not due, no change
    let s = deriveState(events, settings);
    expect(s.facts['6x7'].level).toBe(2);
    events.push(answer(6, 7, T0 + DAY));
    s = deriveState(events, settings);
    expect(s.facts['6x7'].level).toBe(3);
  });

  it('softens a slip on a well-known fact', () => {
    const events = [answer(6, 7, T0, { mode: 'checkup' })];
    for (let d = 1; d <= 40; d += 10) events.push(answer(6, 7, T0 + d * DAY));
    expect(deriveState(events, settings).facts['6x7'].level).toBe(5);
    events.push(answer(6, 7, T0 + 50 * DAY, { correct: false, given: 48 }));
    expect(deriveState(events, settings).facts['6x7'].level).toBe(2);
  });

  it('calibrates the fluency threshold to typing speed', () => {
    const slowTyper = [1, 2, 3].map((i) => answer(10, 3, T0 + i, { mode: 'calibration', latencyMs: 3000 }));
    expect(deriveState(slowTyper, settings).thresholdMs).toBe(5500);
    expect(deriveState([], settings).thresholdMs).toBe(4000);
  });

  it('unlocks ×11 and ×12 once most of 10×10 is fluent (auto range)', () => {
    const events = allFacts(10).map((f, i) => answer(f.a, f.b, T0 + i, { mode: 'checkup' }));
    expect(deriveState(events, settings).activeMax).toBe(12);
    expect(deriveState(events.slice(0, 20), settings).activeMax).toBe(10);
    expect(deriveState(events, withDefaults({ range: 10 })).activeMax).toBe(10);
  });
});

/* ---------- check-up ---------- */

describe('CheckupSession', () => {
  const settings = withDefaults(null);

  it('credits ×1 and ×10 in bulk for a confident learner and covers every fact', () => {
    const student = makeStudent(new Set(allFacts(10).map((f) => f.key)), seededRng(3));
    const { events, asked } = runCheckup(settings, student, T0);
    expect(asked).toBeLessThan(45);
    expect(events.some((e) => e.type === 'checkup_credit')).toBe(true);
    expect(events.at(-1)!.type).toBe('checkup_end');
    const state = deriveState(events, settings);
    expect(state.checkup.done).toBe(true);
    expect(fluentCount(state)).toBe(55);
  });

  it('skips the rest of a table after two misses in a row', () => {
    const known = new Set(allFacts(10).filter((f) => ![6, 7, 8].includes(homeTable(f.a, f.b))).map((f) => f.key));
    const { events, asked } = runCheckup(settings, makeStudent(known, seededRng(4)), T0);
    const skipped = events.filter((e) => e.type === 'checkup_skip');
    expect(skipped.length).toBeGreaterThan(0);
    expect(asked).toBeLessThan(50);
    expect(deriveState(events, settings).checkup.done).toBe(true);
  });

  it('only covers ×1, ×10, ×2 and ×5 for a young learner', () => {
    const young = withDefaults({ profile: 'young' });
    const student = makeStudent(new Set(), seededRng(5));
    const s = new CheckupSession(deriveState([], young), young, 'c', seededRng(1));
    const seen: string[] = [];
    for (let q = s.next(); q; q = s.next()) {
      seen.push(q.key);
      s.record(q, student(q));
    }
    for (const k of seen) expect(groupOf(...(k.split('x').map(Number) as [number, number]))).toBeLessThanOrEqual(1);
  });

  it('can be resumed after a break', () => {
    const student = makeStudent(new Set(['1x4', '3x10', '1x7', '6x10', '8x10']), seededRng(6));
    const s = new CheckupSession(deriveState([], settings), settings, 'c1', seededRng(1));
    const events: TutorEvent[] = [];
    let t = T0;
    for (let i = 0; i < 12; i++) {
      const q = s.next()!;
      for (const pe of s.record(q, student(q)).events) events.push(ev(pe.type, (t += 1000), pe.payload));
    }
    const mid = deriveState(events, settings);
    expect(mid.checkup.done).toBe(false);
    const s2 = new CheckupSession(mid, settings, 'c2', seededRng(2));
    expect(s2.next()?.mode).toBe('checkup'); // no second calibration
    expect(s2.remaining).toBe(mid.checkup.remaining.length);
  });
});

/* ---------- practice ---------- */

describe('PracticeSession', () => {
  const settings = withDefaults(null);
  const easyKnown = new Set(
    allFacts(10)
      .filter((f) => [1, 10, 2, 5].includes(homeTable(f.a, f.b)))
      .map((f) => f.key),
  );

  it('keeps sessions mostly successful, introduces few new facts, and ends on a success', () => {
    const rng = seededRng(11);
    const student = makeStudent(easyKnown, rng);
    let { events } = runCheckup(settings, student, T0);

    for (let day = 1; day <= 5; day++) {
      const { session, events: e, asked } = runPractice(events, settings, student, T0 + day * DAY, day);
      events = events.concat(e);
      expect(session.answered).toBeGreaterThanOrEqual(settings.sessionLength);
      expect(session.answered).toBeLessThanOrEqual(settings.sessionLength + 10);
      expect(session.newIntroduced.length).toBeLessThanOrEqual(3);
      expect(session.accuracy).toBeGreaterThan(0.7);
      const answers = e.filter((x) => x.type === 'answer');
      expect((answers.at(-1)!.payload as AnswerPayload).correct).toBe(true);
      // New facts are introduced with a strategy card and come back later in the session.
      for (const key of session.newIntroduced) {
        expect(asked.filter((q) => q.key === key).length).toBeGreaterThanOrEqual(3);
        expect(asked.find((q) => q.key === key)!.showStrategyFirst).toBe(true);
      }
    }

    const before = fluentCount(deriveState(runCheckup(settings, student, T0).events, settings));
    const after = deriveState(events, settings);
    expect(Object.values(after.facts).filter((f) => f.b <= 10 && f.level >= 2).length).toBeGreaterThan(before);
  });

  it('rarely asks the same fact twice in a row', () => {
    const student = makeStudent(easyKnown, seededRng(12));
    const { events } = runCheckup(settings, student, T0);
    const { asked } = runPractice(events, settings, student, T0 + DAY);
    let repeats = 0;
    for (let i = 1; i < asked.length; i++) if (asked[i].key === asked[i - 1].key) repeats++;
    expect(repeats).toBeLessThanOrEqual(1);
  });

  it('works for a young learner who knows almost nothing yet', () => {
    const young = withDefaults({ profile: 'young' });
    const student = makeStudent(new Set(['1x4', '1x7']), seededRng(13));
    let { events } = runCheckup(young, student, T0);
    for (let day = 1; day <= 3; day++) {
      const r = runPractice(events, young, student, T0 + day * DAY, day);
      expect(r.session.answered).toBeGreaterThan(0);
      expect(r.session.newIntroduced.length).toBeLessThanOrEqual(2);
      for (const q of r.asked) expect(groupOf(q.a, q.b)).toBeLessThanOrEqual(1);
      events = events.concat(r.events);
    }
  });
});

/* ---------- stats ---------- */

describe('stats', () => {
  it('summarises days, streak and trouble facts', () => {
    const settings = withDefaults(null);
    const events: TutorEvent[] = [];
    for (const d of [0, 1, 3]) {
      events.push(answer(6, 8, T0 - d * DAY, { correct: false, given: 46 }));
      events.push(answer(6, 8, T0 - d * DAY + 1000, { latencyMs: 7000 }));
      events.push(ev('session_end', T0 - d * DAY + 2000, { sessionId: 'x', kind: 'practice', answered: 2, correct: 1, durationMs: 120000 }));
    }
    const days = dailyStats(events, T0, 7);
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toMatchObject({ answers: 2, correct: 1, minutes: 2 });
    expect(practiceDaysLast7(events, T0)).toBe(3);
    const trouble = troubleFacts(deriveState(events, settings));
    expect(trouble[0].key).toBe('6x8');
  });
});
