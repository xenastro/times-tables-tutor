import { factKey, groupOf, homeTable, teachingOrder, RULE_TABLES, parseKey } from './facts';
import {
  activeFacts,
  FLUENT_LEVEL,
  median,
  ruleTableKeys,
  thresholdFor,
  type FactState,
  type LearnerState,
} from './mastery';
import type { AnswerMode, EventType, LearnerSettings, QuestionForm } from './types';

export type QuestionKind =
  | 'calibration'
  | 'checkup'
  | 'new'
  | 'learning'
  | 'retry'
  | 'repeat'
  | 'review'
  | 'filler';

const HARD_KINDS: QuestionKind[] = ['new', 'learning', 'retry', 'repeat'];

export interface Question {
  /** Displayed as `a × b` (orientation already chosen). */
  a: number;
  b: number;
  key: string;
  kind: QuestionKind;
  mode: AnswerMode;
  /** Show the strategy card before asking (new facts, or the first missing-number question ever). */
  showStrategyFirst: boolean;
  /** Absent means "product". */
  form?: QuestionForm;
  /** For a missing-number question: which factor is hidden. */
  missing?: 'a' | 'b';
}

/** The number the learner should type: the product, or the hidden factor. */
export function expectedAnswer(q: Pick<Question, 'a' | 'b' | 'form' | 'missing'>): number {
  if (q.form === 'missing') return q.missing === 'a' ? q.a : q.b;
  return q.a * q.b;
}

export interface AnswerInput {
  given: number | null;
  latencyMs: number;
  hintUsed: boolean;
}

export interface PendingEvent {
  type: EventType;
  payload: unknown;
}

export interface RecordResult {
  correct: boolean;
  /** Correct, unhinted and within the learner's threshold. */
  fluent: boolean;
  events: PendingEvent[];
}

type Rng = () => number;

function orient(a: number, b: number, rng: Rng): [number, number] {
  return rng() < 0.5 ? [a, b] : [b, a];
}

function question(f: { a: number; b: number; key: string }, kind: QuestionKind, mode: AnswerMode, rng: Rng): Question {
  const [a, b] = orient(f.a, f.b, rng);
  return { a, b, key: f.key, kind, mode, showStrategyFirst: kind === 'new' };
}

function answerEvent(q: Question, input: AnswerInput, correct: boolean, sessionId: string): PendingEvent {
  return {
    type: 'answer',
    payload: {
      a: q.a,
      b: q.b,
      given: input.given,
      correct,
      latencyMs: Math.round(input.latencyMs),
      mode: q.mode,
      hinted: q.showStrategyFirst || input.hintUsed,
      sessionId,
      ...(q.form === 'missing' ? { form: 'missing', missing: q.missing } : {}),
    },
  };
}

function asMissing(q: Question, rng: Rng, intro: boolean): Question {
  return { ...q, form: 'missing', missing: rng() < 0.5 ? 'a' : 'b', showStrategyFirst: intro };
}

/* ------------------------------------------------------------------------------------------ */
/* Check-up: find out what the learner already knows, gently.                                  */
/* ------------------------------------------------------------------------------------------ */

/** Easy samples used to measure how fast this learner types (and to sample the rule tables). */
const CALIBRATION: [number, number][] = [
  [1, 4],
  [10, 3],
  [1, 7],
  [10, 6],
  [10, 8],
];

/** Two misses in a row within a table → skip the rest of that table for now. */
const MISSES_TO_SKIP = 2;
export const CHECKUP_BREAK_EVERY = 25;

export class CheckupSession {
  readonly sessionId: string;
  answered = 0;
  correctCount = 0;
  private queue: Question[] = [];
  private calibrationLatencies: number[];
  private calibrationResults: { table: number; fluent: boolean }[] = [];
  private missStreak = new Map<number, number>();
  private resolved = new Set<string>();
  private max: number;
  private settings: LearnerSettings;

  constructor(state: LearnerState, settings: LearnerSettings, sessionId: string, rng: Rng = Math.random) {
    this.sessionId = sessionId;
    this.settings = settings;
    this.max = settings.range === 12 ? 12 : 10;
    this.calibrationLatencies = state.baselineMs == null ? [] : [state.baselineMs];

    const remaining = new Set(state.checkup.remaining);
    if (state.baselineMs == null) {
      for (const [a, b] of CALIBRATION) {
        const key = factKey(a, b);
        this.queue.push({ a, b, key, kind: 'calibration', mode: 'calibration', showStrategyFirst: false });
        remaining.delete(key);
      }
    }
    const ordered = teachingOrder([...remaining].map(parseKey));
    for (const f of ordered) this.queue.push(question(f, 'checkup', 'checkup', rng));
  }

  get remaining(): number {
    return this.queue.length;
  }

  get done(): boolean {
    return this.queue.length === 0;
  }

  /** True at natural pause points, so a long check-up can be split across sittings. */
  get offerBreak(): boolean {
    return this.answered > 0 && this.answered % CHECKUP_BREAK_EVERY === 0 && !this.done;
  }

  get threshold(): number {
    const base = this.calibrationLatencies.length ? median(this.calibrationLatencies) : null;
    return thresholdFor(base, this.settings.thresholdOffsetMs);
  }

  next(): Question | null {
    return this.queue[0] ?? null;
  }

  record(q: Question, input: AnswerInput): RecordResult {
    if (this.queue[0] === q) this.queue.shift();
    const correct = input.given === expectedAnswer(q);
    this.answered++;
    if (correct) this.correctCount++;
    const events: PendingEvent[] = [answerEvent(q, input, correct, this.sessionId)];

    if (q.mode === 'calibration' && correct) this.calibrationLatencies.push(input.latencyMs);
    const fluent = correct && !input.hintUsed && input.latencyMs <= this.threshold;
    this.resolved.add(q.key);

    const table = homeTable(q.a, q.b);
    if (q.mode === 'calibration') {
      this.calibrationResults.push({ table, fluent });
      const calibrationLeft = this.queue.some((x) => x.mode === 'calibration');
      if (!calibrationLeft) events.push(...this.creditRuleTables());
    } else {
      const streak = correct ? 0 : (this.missStreak.get(table) ?? 0) + 1;
      this.missStreak.set(table, streak);
      if (streak >= MISSES_TO_SKIP) {
        const skipped = this.queue.filter((x) => homeTable(x.a, x.b) === table).map((x) => x.key);
        if (skipped.length) {
          this.queue = this.queue.filter((x) => homeTable(x.a, x.b) !== table);
          events.push({ type: 'checkup_skip', payload: { keys: skipped, sessionId: this.sessionId } });
        }
      }
    }

    if (this.done) events.push({ type: 'checkup_end', payload: { sessionId: this.sessionId } });
    return { correct, fluent, events };
  }

  /** If every sample from ×1 (or ×10) was fluent, don't make them answer the whole table. */
  private creditRuleTables(): PendingEvent[] {
    const events: PendingEvent[] = [];
    for (const table of RULE_TABLES) {
      const samples = this.calibrationResults.filter((r) => r.table === table);
      if (!samples.length || !samples.every((r) => r.fluent)) continue;
      const keys = ruleTableKeys(table, this.max).filter(
        (k) => !this.resolved.has(k) && this.queue.some((x) => x.key === k),
      );
      if (!keys.length) continue;
      this.queue = this.queue.filter((x) => !keys.includes(x.key));
      events.push({ type: 'checkup_credit', payload: { keys, sessionId: this.sessionId } });
    }
    return events;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Daily practice: mostly success, a few new facts woven between known ones.                   */
/* ------------------------------------------------------------------------------------------ */

const MIN_FILLERS = 4;
const TARGET_ACCURACY = 0.85;
const MAX_PER_FACT = 6;
/** Never run more than this many answers past the planned length, whatever happens. */
const HARD_CAP_EXTRA = 8;
/** Extra answers allowed at the end to finish pending retries. */
const WRAP_UP_EXTRA = 4;
/** A group of tables opens once this share of the previous groups is at level 2+. */
const GROUP_GATE = 0.7;
/** Missing-number questions (? × 7 = 56): only from fluent facts, a few per session, never at the very start or end. */
const MISSING_SHARE = 0.3;
const MAX_MISSING = 4;
const MAX_MISSING_YOUNG = 3;
const MISSING_FROM = 4;

interface Scheduled {
  at: number;
  q: Question;
}

export class PracticeSession {
  readonly sessionId: string;
  readonly length: number;
  answered = 0;
  correctCount = 0;
  newIntroduced: string[] = [];

  private reviews: FactState[];
  private learning: FactState[];
  private newPool: FactState[];
  private fillers: FactState[];
  private scheduled: Scheduled[] = [];
  private maxNew: number;
  private lastWasHard = false;
  private lastCorrect = true;
  private recentKeys: string[] = [];
  private timesAsked = new Map<string, number>();
  private slowRepeats = new Set<string>();
  private finished = false;
  private thresholdMs: number;
  private rng: Rng;
  missingAsked = 0;
  private maxMissing: number;
  private missingIntroDone: boolean;

  constructor(
    state: LearnerState,
    settings: LearnerSettings,
    sessionId: string,
    now: number,
    rng: Rng = Math.random,
  ) {
    this.sessionId = sessionId;
    this.length = settings.sessionLength;
    this.rng = rng;
    this.thresholdMs = state.thresholdMs;
    this.maxNew = settings.profile === 'young' ? 2 : 3;
    this.maxMissing = settings.profile === 'young' ? MAX_MISSING_YOUNG : MAX_MISSING;
    this.missingIntroDone = state.missing.attempts > 0;

    const facts = activeFacts(state);
    this.reviews = facts
      .filter((f) => f.level >= 2 && f.dueAt != null && f.dueAt <= now)
      .sort((x, y) => (x.dueAt ?? 0) - (y.dueAt ?? 0));
    this.learning = facts.filter((f) => f.level === 1).sort((x, y) => (x.dueAt ?? 0) - (y.dueAt ?? 0));

    const openGroup = openGroupFor(facts);
    this.newPool = teachingOrder(facts.filter((f) => f.level === 0 && groupOf(f.a, f.b) <= openGroup)) as FactState[];

    const reviewKeys = new Set(this.reviews.map((f) => f.key));
    let fillers = facts.filter((f) => f.level >= FLUENT_LEVEL && !reviewKeys.has(f.key));
    if (fillers.length < MIN_FILLERS) {
      fillers = fillers.concat(facts.filter((f) => f.level === 2 && !reviewKeys.has(f.key)));
    }
    if (fillers.length < MIN_FILLERS) {
      const have = new Set(fillers.map((f) => f.key));
      fillers = fillers.concat(
        facts.filter((f) => RULE_TABLES.includes(homeTable(f.a, f.b)) && !have.has(f.key) && f.level > 0),
      );
    }
    this.fillers = fillers;
  }

  get done(): boolean {
    return this.finished;
  }

  get accuracy(): number {
    return this.answered ? this.correctCount / this.answered : 1;
  }

  /** 0..1, for a calm progress bar (not a timer). */
  get progress(): number {
    return Math.min(1, this.answered / this.length);
  }

  next(): Question | null {
    if (this.finished) return null;
    const q = this.pick();
    if (!q) this.finished = true;
    return q;
  }

  private pick(): Question | null {
    if (this.answered >= this.length + HARD_CAP_EXTRA) return null;
    this.scheduled = this.scheduled.filter((s) => this.canAsk(s.q.key));
    const dueIdx = this.earliestDue();
    if (dueIdx >= 0) {
      const due = this.scheduled[dueIdx];
      if (due.q.key !== this.recentKeys[this.recentKeys.length - 1]) return this.scheduled.splice(dueIdx, 1)[0].q;
      // Same fact as the one just asked: let one other question go first.
      due.at = this.answered + 1;
    }

    if (this.answered >= this.length) {
      const retriesPending = this.scheduled.some((s) => s.q.kind === 'retry');
      if (this.lastCorrect && (!retriesPending || this.answered >= this.length + WRAP_UP_EXTRA)) return null;
      // Wrap up: let pending retries come due, and always end on a success.
      return this.easy() ?? this.pullScheduled();
    }

    if (this.lastWasHard) return this.easy() ?? this.hard() ?? this.pullScheduled();
    return this.hard() ?? this.easy() ?? this.pullScheduled();
  }

  private earliestDue(): number {
    let best = -1;
    for (let i = 0; i < this.scheduled.length; i++) {
      const s = this.scheduled[i];
      if (s.at <= this.answered && (best < 0 || s.at < this.scheduled[best].at)) best = i;
    }
    return best;
  }

  /** Nothing else to ask: bring the next scheduled item forward rather than stopping early. */
  private pullScheduled(): Question | null {
    if (!this.scheduled.length) return null;
    this.scheduled.sort((x, y) => x.at - y.at);
    // Avoid asking the same fact twice in a row when anything else is waiting.
    const last = this.recentKeys[this.recentKeys.length - 1];
    const i = this.scheduled.findIndex((s) => s.q.key !== last);
    return this.scheduled.splice(i >= 0 ? i : 0, 1)[0].q;
  }

  private easy(): Question | null {
    const last = this.recentKeys[this.recentKeys.length - 1];
    const ri = this.reviews.findIndex((f) => f.key !== last && this.canAsk(f.key));
    if (ri >= 0) return question(this.reviews.splice(ri, 1)[0], 'review', 'practice', this.rng);
    const recent = new Set(this.recentKeys.slice(-3));
    const pool = this.fillers.filter((f) => !recent.has(f.key) && this.canAsk(f.key));
    if (!pool.length) return null;
    const f = pool[Math.floor(this.rng() * pool.length)];
    const q = question(f, 'filler', 'practice', this.rng);
    return this.maybeMissing(q, f) ?? q;
  }

  /**
   * Sometimes turn a filler (never a due review, so no review is lost) into "? × 7 = 56".
   * Only for fluent facts without a ×1: the multiplication must already be known.
   */
  private maybeMissing(q: Question, f: FactState): Question | null {
    if (f.level < FLUENT_LEVEL || Math.min(f.a, f.b) < 2) return null;
    if (this.missingAsked >= this.maxMissing) return null;
    if (this.answered < MISSING_FROM || this.answered >= this.length - 3) return null;
    // The very first one comes with an introduction, on a fact like 8 × 7 (with 8 × 8 you can't
    // tell which 8 is hiding); after that, mix them in.
    if (!this.missingIntroDone && f.a === f.b) return null;
    if (this.missingIntroDone && this.rng() >= MISSING_SHARE) return null;
    this.missingAsked++;
    const intro = !this.missingIntroDone;
    this.missingIntroDone = true;
    return asMissing(q, this.rng, intro);
  }

  private hard(): Question | null {
    const last = this.recentKeys[this.recentKeys.length - 1];
    const li = this.learning.findIndex((f) => f.key !== last && this.canAsk(f.key));
    if (li >= 0) return question(this.learning.splice(li, 1)[0], 'learning', 'practice', this.rng);
    if (this.canIntroduceNew()) {
      const f = this.newPool.shift()!;
      this.newIntroduced.push(f.key);
      const q = question(f, 'new', 'practice', this.rng);
      // Expanding repeats: soon, then a bit later, then later still.
      for (const gap of [3, 6, 10]) this.schedule(f, 'repeat', gap);
      return q;
    }
    return null;
  }

  private canIntroduceNew(): boolean {
    if (!this.newPool.length || this.newIntroduced.length >= this.maxNew) return false;
    if (this.answered >= this.length - 6) return false;
    if (this.answered >= 6 && this.accuracy < TARGET_ACCURACY) return false;
    const pendingHard = this.learning.length + this.scheduled.filter((s) => s.q.kind === 'retry').length;
    return pendingHard <= 2;
  }

  private canAsk(key: string): boolean {
    return (this.timesAsked.get(key) ?? 0) < MAX_PER_FACT;
  }

  private schedule(f: { a: number; b: number; key: string }, kind: QuestionKind, gap: number) {
    this.scheduled.push({ at: this.answered + gap, q: question(f, kind, 'practice', this.rng) });
  }

  record(q: Question, input: AnswerInput): RecordResult {
    const correct = input.given === expectedAnswer(q);
    const isMissing = q.form === 'missing';
    const fluent = correct && !input.hintUsed && !q.showStrategyFirst && input.latencyMs <= this.thresholdMs;
    this.answered++;
    if (correct) this.correctCount++;
    this.lastCorrect = correct;
    this.lastWasHard = HARD_KINDS.includes(q.kind) || !correct || isMissing;
    this.recentKeys.push(q.key);
    this.timesAsked.set(q.key, (this.timesAsked.get(q.key) ?? 0) + 1);

    const f = parseKey(q.key);
    if (isMissing) {
      // One more go at the same puzzle a little later, after working it out together.
      if (!correct && !this.scheduled.some((s) => s.q.key === q.key && s.q.form === 'missing')) {
        this.scheduled.push({ at: this.answered + 3, q: asMissing(question(f, 'retry', 'practice', this.rng), this.rng, false) });
      }
    } else if (!correct) {
      // Show the answer, then come back to it twice so it ends on a success.
      this.scheduled = this.scheduled.filter((s) => !(s.q.key === q.key && s.q.kind === 'retry'));
      this.schedule(f, 'retry', 2);
      this.schedule(f, 'retry', 5);
    } else if (!fluent && (q.kind === 'learning' || q.kind === 'review') && !this.slowRepeats.has(q.key)) {
      this.slowRepeats.add(q.key);
      this.schedule(f, 'repeat', 4);
    }

    return { correct, fluent, events: [answerEvent(q, input, correct, this.sessionId)] };
  }
}

/** Highest teaching group the learner may receive new facts from. */
export function openGroupFor(facts: FactState[]): number {
  let open = 0;
  for (let g = 0; g < 5; g++) {
    const inGroup = facts.filter((f) => groupOf(f.a, f.b) === g);
    if (!inGroup.length) break;
    open = g;
    const started = inGroup.filter((f) => f.level >= 2).length / inGroup.length;
    if (started < GROUP_GATE) break;
  }
  return open;
}
