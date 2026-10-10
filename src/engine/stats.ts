import { factKey } from './facts';
import { DAY, median, type LearnerState } from './mastery';
import { isProductAnswer, type AnswerPayload, type Feeling, type FeelingPayload, type SessionEndPayload, type TutorEvent } from './types';

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DayStats {
  day: string;
  answers: number;
  correct: number;
  minutes: number;
  medianLatencyMs: number | null;
}

/** Practice per calendar day (local time), oldest first, covering the last `days` days. */
export function dailyStats(events: TutorEvent[], now: number, days = 14): DayStats[] {
  const byDay = new Map<string, { answers: number; correct: number; ms: number; lat: number[] }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(now - i * DAY), { answers: 0, correct: 0, ms: 0, lat: [] });

  for (const e of events) {
    const bucket = byDay.get(dayKey(e.ts));
    if (!bucket) continue;
    if (e.type === 'answer') {
      const p = e.payload as AnswerPayload;
      bucket.answers++;
      if (p.correct) {
        bucket.correct++;
        if (!p.hinted && isProductAnswer(p)) bucket.lat.push(p.latencyMs);
      }
    } else if (e.type === 'session_end') {
      bucket.ms += (e.payload as SessionEndPayload).durationMs;
    }
  }

  return [...byDay.entries()].map(([day, b]) => ({
    day,
    answers: b.answers,
    correct: b.correct,
    minutes: Math.round((b.ms / 60000) * 10) / 10,
    medianLatencyMs: b.lat.length ? Math.round(median(b.lat)) : null,
  }));
}

/** Days with at least one answer, among the last 7 (including today). */
export function practiceDaysLast7(events: TutorEvent[], now: number): number {
  const recent = new Set<string>();
  for (let i = 0; i < 7; i++) recent.add(dayKey(now - i * DAY));
  const practised = new Set<string>();
  for (const e of events) {
    if (e.type === 'answer') {
      const k = dayKey(e.ts);
      if (recent.has(k)) practised.add(k);
    }
  }
  return practised.size;
}

export function practisedToday(events: TutorEvent[], now: number): boolean {
  const today = dayKey(now);
  return events.some(
    (e) => e.type === 'session_end' && (e.payload as SessionEndPayload).kind === 'practice' && dayKey(e.ts) === today,
  );
}

export interface TroubleFact {
  key: string;
  a: number;
  b: number;
  attempts: number;
  accuracy: number;
  medianLatencyMs: number | null;
}

/** Facts that need the most help: low recent accuracy first, then slow. */
export function troubleFacts(state: LearnerState, limit = 6): TroubleFact[] {
  return Object.values(state.facts)
    .filter((f) => f.b <= state.activeMax && f.recentResults.length >= 2)
    .map((f) => ({
      key: f.key,
      a: f.a,
      b: f.b,
      attempts: f.attempts,
      accuracy: f.recentResults.filter(Boolean).length / f.recentResults.length,
      medianLatencyMs: f.recentLatencies.length ? Math.round(median(f.recentLatencies)) : null,
    }))
    .filter((f) => f.accuracy < 1 || (f.medianLatencyMs ?? 0) > state.thresholdMs)
    .sort((x, y) => x.accuracy - y.accuracy || (y.medianLatencyMs ?? 0) - (x.medianLatencyMs ?? 0))
    .slice(0, limit);
}

export function feelings(events: TutorEvent[], limit = 14): { ts: number; feeling: Feeling }[] {
  return events
    .filter((e) => e.type === 'feeling')
    .sort((x, y) => x.ts - y.ts)
    .slice(-limit)
    .map((e) => ({ ts: e.ts, feeling: (e.payload as FeelingPayload).feeling }));
}

/** First and latest median response time for one fact, to show "twice as fast as last week". */
export function factHistory(events: TutorEvent[], key: string): { ts: number; correct: boolean; latencyMs: number }[] {
  return events
    .filter((e) => e.type === 'answer')
    .map((e) => ({ e, p: e.payload as AnswerPayload }))
    .filter(({ p }) => factKey(p.a, p.b) === key && isProductAnswer(p))
    .sort((x, y) => x.e.ts - y.e.ts)
    .map(({ e, p }) => ({ ts: e.ts, correct: p.correct, latencyMs: p.latencyMs }));
}

export interface SessionRow {
  sessionId: string;
  ts: number;
  kind: string;
  answered: number;
  correct: number;
  durationMs: number;
}

export function sessionHistory(events: TutorEvent[], limit = 10): SessionRow[] {
  return events
    .filter((e) => e.type === 'session_end')
    .sort((x, y) => y.ts - x.ts)
    .slice(0, limit)
    .map((e) => {
      const p = e.payload as SessionEndPayload;
      return { sessionId: p.sessionId, ts: e.ts, kind: p.kind, answered: p.answered, correct: p.correct, durationMs: p.durationMs };
    });
}
