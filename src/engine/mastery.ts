import { allFacts, factKey, groupOf, homeTable, parseKey, RULE_TABLES, teachingOrder, type Fact } from './facts';
import type { AnswerPayload, CheckupKeysPayload, LearnerSettings, TutorEvent } from './types';

export const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Days until the next review for each level. Level 1 is due again in the same session. */
export const INTERVAL_DAYS = [0, 0, 1, 3, 7, 21];
export const MAX_LEVEL = 5;
/** Reviews may happen a little early (e.g. practising in the morning after an evening session). */
const EARLY_SLACK = 6 * HOUR;

export const FLUENT_LEVEL = 3;
/** ×11 and ×12 unlock once every 10×10 fact has been started and this share is fluent. */
export const BONUS_UNLOCK_SHARE = 0.8;

export interface FactState extends Fact {
  level: number;
  /** When it should next be reviewed; null for facts never seen. */
  dueAt: number | null;
  attempts: number;
  correct: number;
  lastSeenAt: number | null;
  /** Latencies of recent correct answers (most recent last, max 10). */
  recentLatencies: number[];
  /** Outcomes of recent answers (most recent last, max 10). */
  recentResults: boolean[];
  seenInCheckup: boolean;
}

export interface LearnerState {
  facts: Record<string, FactState>;
  /** Median latency on trivial facts; how fast this learner types on this phone. */
  baselineMs: number | null;
  thresholdMs: number;
  /** Largest factor currently in play (10, or 12 once unlocked). */
  activeMax: number;
  checkup: { done: boolean; started: boolean; remaining: string[] };
}

const DEFAULT_THRESHOLD_MS = 4000;
const BASELINE_MARGIN_MS = 2500;

export function thresholdFor(baselineMs: number | null, offsetMs: number): number {
  const base = baselineMs == null ? DEFAULT_THRESHOLD_MS : baselineMs + BASELINE_MARGIN_MS;
  return clamp(base + offsetMs, 2500, 12000);
}

export function median(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function blankFact(f: Fact): FactState {
  return {
    ...f,
    level: 0,
    dueAt: null,
    attempts: 0,
    correct: 0,
    lastSeenAt: null,
    recentLatencies: [],
    recentResults: [],
    seenInCheckup: false,
  };
}

function push<T>(arr: T[], x: T, max = 10) {
  arr.push(x);
  if (arr.length > max) arr.shift();
}

export function dueAfter(level: number, ts: number): number {
  const days = INTERVAL_DAYS[level];
  return days === 0 ? ts : ts + days * DAY - EARLY_SLACK;
}

/** Which facts the check-up covers for these settings. */
export function checkupFacts(settings: LearnerSettings): Fact[] {
  const max = settings.range === 12 ? 12 : 10;
  const maxGroup = settings.profile === 'young' ? 1 : 99;
  return teachingOrder(allFacts(max).filter((f) => groupOf(f.a, f.b) <= maxGroup));
}

/**
 * Replay the event log into per-fact state. Pure: same events + settings → same state,
 * so improving the method later just means replaying everyone's history.
 */
export function deriveState(events: TutorEvent[], settings: LearnerSettings): LearnerState {
  const facts: Record<string, FactState> = {};
  for (const f of allFacts(12)) facts[f.key] = blankFact(f);

  const sorted = [...events].sort((x, y) => x.ts - y.ts);

  const calibration: number[] = [];
  let baselineMs: number | null = null;
  let threshold = thresholdFor(null, settings.thresholdOffsetMs);
  let checkupStarted = false;
  let checkupEnded = false;

  for (const e of sorted) {
    if (e.type === 'session_start' && (e.payload as { kind?: string }).kind === 'checkup') checkupStarted = true;
    if (e.type === 'checkup_end') checkupEnded = true;

    if (e.type === 'checkup_skip' || e.type === 'checkup_credit') {
      const p = e.payload as CheckupKeysPayload;
      for (const key of p.keys) {
        const f = facts[key];
        if (!f) continue;
        f.seenInCheckup = true;
        if (e.type === 'checkup_credit' && f.level < FLUENT_LEVEL) {
          f.level = FLUENT_LEVEL;
          f.dueAt = dueAfter(FLUENT_LEVEL, e.ts);
        }
      }
      continue;
    }

    if (e.type !== 'answer') continue;
    const p = e.payload as AnswerPayload;
    const f = facts[factKey(p.a, p.b)];
    if (!f) continue;

    f.attempts++;
    f.lastSeenAt = e.ts;
    push(f.recentResults, p.correct);
    if (p.correct) {
      f.correct++;
      push(f.recentLatencies, p.latencyMs);
    }

    if (p.mode === 'calibration' && p.correct) {
      calibration.push(p.latencyMs);
      baselineMs = median(calibration);
      threshold = thresholdFor(baselineMs, settings.thresholdOffsetMs);
    }

    const fluent = p.correct && !p.hinted && p.latencyMs <= threshold;

    if (p.mode === 'calibration' || p.mode === 'checkup') {
      checkupStarted = true;
      f.seenInCheckup = true;
      if (fluent) {
        f.level = Math.max(f.level, FLUENT_LEVEL);
        f.dueAt = dueAfter(f.level, e.ts);
      } else if (p.correct) {
        // Knows it but works it out: needs fluency practice.
        f.level = Math.max(f.level, 1);
        f.dueAt = e.ts;
      }
      // A miss leaves the fact as "new": it will be taught with a strategy card.
      continue;
    }

    applyPracticeAnswer(f, p, fluent, e.ts);
  }

  const max10 = allFacts(10);
  const fluent10 = max10.filter((f) => facts[f.key].level >= FLUENT_LEVEL).length;
  const allStarted10 = max10.every((f) => facts[f.key].level > 0);
  const bonusEarned = allStarted10 && fluent10 / max10.length >= BONUS_UNLOCK_SHARE;
  const activeMax = settings.range === 12 || (settings.range === 'auto' && bonusEarned) ? 12 : 10;

  const remaining = checkupFacts(settings)
    .filter((f) => !facts[f.key].seenInCheckup)
    .map((f) => f.key);

  return {
    facts,
    baselineMs,
    thresholdMs: threshold,
    activeMax,
    checkup: { started: checkupStarted, done: checkupEnded || remaining.length === 0, remaining },
  };
}

function applyPracticeAnswer(f: FactState, p: AnswerPayload, fluent: boolean, ts: number) {
  if (!p.correct) {
    // A slip on a well-known fact (often a typo on a phone) shouldn't send it all the way back.
    f.level = f.level >= 4 ? 2 : 1;
    f.dueAt = ts;
    return;
  }

  if (f.level === 0) {
    f.level = 1;
    f.dueAt = ts;
    return;
  }

  if (f.level === 1) {
    if (fluent) {
      f.level = 2;
      f.dueAt = dueAfter(2, ts);
    }
    return;
  }

  const wasDue = f.dueAt == null || ts >= f.dueAt;
  if (fluent) {
    if (wasDue) {
      f.level = Math.min(MAX_LEVEL, f.level + 1);
      f.dueAt = dueAfter(f.level, ts);
    }
  } else {
    // Correct but slow: keep the level, look at it again soon.
    f.dueAt = Math.min(f.dueAt ?? Infinity, dueAfter(2, ts));
  }
}

/** Facts available to this learner right now (respecting 10×10 vs 12×12). */
export function activeFacts(state: LearnerState): FactState[] {
  return Object.values(state.facts).filter((f) => f.b <= state.activeMax);
}

export function countByLevel(state: LearnerState): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const f of activeFacts(state)) counts[f.level]++;
  return counts;
}

export function fluentCount(state: LearnerState): number {
  return activeFacts(state).filter((f) => f.level >= FLUENT_LEVEL).length;
}

/** Keys of rule-table facts (×1, ×10) — used to credit them in bulk during the check-up. */
export function ruleTableKeys(table: number, max: number): string[] {
  if (!RULE_TABLES.includes(table)) return [];
  return allFacts(max)
    .filter((f) => homeTable(f.a, f.b) === table)
    .map((f) => f.key);
}

export { parseKey };
