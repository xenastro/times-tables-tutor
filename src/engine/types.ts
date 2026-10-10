export type EventType =
  | 'answer'
  | 'checkup_skip'
  | 'checkup_credit'
  | 'checkup_end'
  | 'session_start'
  | 'session_end'
  | 'hint_shown'
  | 'strategy_viewed'
  | 'feeling'
  | 'settings_changed'
  | 'tip_shown'
  | 'lesson_done';

/** One immutable record in a learner's log. Everything else is derived from these. */
export interface TutorEvent<P = unknown> {
  id: string;
  learnerId: string;
  type: EventType;
  /** Client time, epoch ms. */
  ts: number;
  payload: P;
}

export type AnswerMode = 'calibration' | 'checkup' | 'practice';

/** "product": 7 × 8 = ?  ·  "missing": ? × 8 = 56 (a first step into division). */
export type QuestionForm = 'product' | 'missing';

export interface AnswerPayload {
  a: number;
  b: number;
  /** null when the learner chose "Not sure yet". For a missing-number question, the number typed for the gap. */
  given: number | null;
  correct: boolean;
  latencyMs: number;
  mode: AnswerMode;
  /** True when a strategy card was on screen for this fact just before answering. */
  hinted: boolean;
  sessionId: string;
  /** Absent on older events, which are all products. */
  form?: QuestionForm;
  /** Which factor was hidden, for a missing-number question. */
  missing?: 'a' | 'b';
}

export function isProductAnswer(p: AnswerPayload): boolean {
  return (p.form ?? 'product') === 'product';
}

export interface CheckupKeysPayload {
  keys: string[];
  sessionId: string;
}

export type SessionKind = 'checkup' | 'practice' | 'game';

export interface SessionStartPayload {
  sessionId: string;
  kind: SessionKind;
}

export interface SessionEndPayload {
  sessionId: string;
  kind: SessionKind;
  answered: number;
  correct: number;
  durationMs: number;
  /** For games: which one ("pairs", "row") and, for a row, its table. */
  game?: string;
  table?: number;
}

export type Feeling = 'calm' | 'ok' | 'hard';

export interface FeelingPayload {
  sessionId: string;
  feeling: Feeling;
}

export interface HintPayload {
  a: number;
  b: number;
  sessionId: string;
}

export type Range = 10 | 12 | 'auto';
export type Profile = 'standard' | 'young';
export type PictureHints = 'always' | 'mistakes' | 'off';

export interface LearnerSettings {
  range: Range;
  profile: Profile;
  /** Number of answers in a practice session. */
  sessionLength: number;
  pictureHints: PictureHints;
  /** Added to the fluency threshold; positive = more forgiving. */
  thresholdOffsetMs: number;
  /** Read questions and steps aloud with the phone's built-in voice. */
  readAloud: boolean;
  /** Language of the child's screens. */
  language: Language;
  /** 0123 or ٠١٢٣. */
  numerals: Numerals;
  /** Hear (and see) each question in Arabic words; answer in digits. */
  bilingual: boolean;
}

export type Language = 'en' | 'ar';
export type Numerals = 'western' | 'eastern';

export const DEFAULT_SETTINGS: LearnerSettings = {
  range: 'auto',
  profile: 'standard',
  sessionLength: 30,
  pictureHints: 'mistakes',
  thresholdOffsetMs: 0,
  readAloud: false,
  language: 'en',
  numerals: 'western',
  bilingual: false,
};

export const YOUNG_DEFAULTS: Partial<LearnerSettings> = {
  profile: 'young',
  sessionLength: 20,
  pictureHints: 'always',
  thresholdOffsetMs: 1500,
  readAloud: true,
};

export function withDefaults(s: Partial<LearnerSettings> | null | undefined): LearnerSettings {
  const base = s?.profile === 'young' ? { ...DEFAULT_SETTINGS, ...YOUNG_DEFAULTS } : DEFAULT_SETTINGS;
  return { ...base, ...(s ?? {}) };
}
