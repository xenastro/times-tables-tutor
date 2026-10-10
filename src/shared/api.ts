/** Shapes shared by the Worker API and the app. */

import type { EventType, LearnerSettings } from '../engine/types';

export interface LearnerDTO {
  id: string;
  displayName: string;
  birthYear: number | null;
  avatar: string;
  theme: string;
  settings: Partial<LearnerSettings>;
  /** A parent has this child in their account (children may start on their own). */
  connected?: boolean;
}

export interface LearnerSummaryDTO extends LearnerDTO {
  deviceCount: number;
  lastActivityAt: number | null;
}

export interface DeviceDTO {
  id: string;
  label: string | null;
  pairedAt: number;
  lastSeenAt: number | null;
}

export interface PasskeyDTO {
  id: string;
  label: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface EventDTO {
  id: string;
  type: EventType;
  ts: number;
  payload: unknown;
}

export interface EventsPage {
  events: EventDTO[];
  lastSeq: number;
  more: boolean;
}

export const EVENT_TYPES: EventType[] = [
  'answer',
  'checkup_skip',
  'checkup_credit',
  'checkup_end',
  'session_start',
  'session_end',
  'hint_shown',
  'strategy_viewed',
  'feeling',
  'settings_changed',
  'tip_shown',
  'lesson_done',
];

export const AVATARS =['🦊', '🐼', '🦉', '🐙', '🐢', '🦄', '🐧', '🦁', '🚀', '🌙', '⚡', '🎧'];
export const THEMES = ['teal', 'violet', 'coral', 'blue', 'green', 'amber'] as const;
