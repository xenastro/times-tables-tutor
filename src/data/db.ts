import Dexie, { type Table } from 'dexie';
import type { TutorEvent } from '../engine/types';
import type { LearnerDTO } from '../shared/api';

export interface StoredEvent extends TutorEvent {
  /** 0 = waiting to upload, 1 = on the server. (IndexedDB can't index booleans.) */
  synced: 0 | 1;
}

export interface DeviceRecord {
  token: string;
  learner: LearnerDTO;
  /** Highest server sequence number pulled so far. */
  lastSeq: number;
  /** Avatar/theme changed while offline and not yet sent. */
  profilePending?: boolean;
}

class TutorDB extends Dexie {
  events!: Table<StoredEvent, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('ashra');
    this.version(1).stores({
      events: 'id, learnerId, ts, synced',
      kv: 'key',
    });
  }
}

export const db = new TutorDB();

export async function getDevice(): Promise<DeviceRecord | null> {
  const row = await db.kv.get('device');
  return (row?.value as DeviceRecord) ?? null;
}

export async function setDevice(device: DeviceRecord | null): Promise<void> {
  if (device) await db.kv.put({ key: 'device', value: device });
  else await db.kv.delete('device');
}

export async function loadEvents(learnerId: string): Promise<StoredEvent[]> {
  return db.events.where('learnerId').equals(learnerId).sortBy('ts');
}

/** Ask the browser not to clear our storage under pressure (Android Chrome usually grants this for installed apps). */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
