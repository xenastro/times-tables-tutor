import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deriveState, type LearnerState } from '../engine/mastery';
import type { PendingEvent } from '../engine/session';
import { withDefaults, type LearnerSettings, type TutorEvent } from '../engine/types';
import { api, ApiError, newId } from '../data/api';
import { db, loadEvents, setDevice, type DeviceRecord, type StoredEvent } from '../data/db';
import type { EventsPage, LearnerDTO } from '../shared/api';

export type SyncStatus = 'synced' | 'syncing' | 'offline';

interface LearnerCtx {
  learner: LearnerDTO;
  settings: LearnerSettings;
  events: TutorEvent[];
  state: LearnerState;
  loaded: boolean;
  syncStatus: SyncStatus;
  addEvents(pending: PendingEvent[]): TutorEvent[];
  updateLook(look: { avatar?: string; theme?: string }): void;
  /** This phone's token, for the few calls the screens make themselves ("show my code"). */
  token: string;
}

const Ctx = createContext<LearnerCtx | null>(null);

export function useLearner(): LearnerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLearner outside provider');
  return c;
}

const PUSH_BATCH = 400;

export function LearnerProvider({
  device: initialDevice,
  onUnpaired,
  children,
}: {
  device: DeviceRecord;
  onUnpaired: () => void;
  children: ReactNode;
}) {
  const [device, setDeviceState] = useState(initialDevice);
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const [events, setEvents] = useState<TutorEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const syncing = useRef(false);
  const again = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const learnerId = device.learner.id;

  const saveDevice = useCallback(async (next: DeviceRecord) => {
    deviceRef.current = next;
    setDeviceState(next);
    await setDevice(next);
  }, []);

  const sync = useCallback(async () => {
    if (syncing.current) {
      again.current = true;
      return;
    }
    syncing.current = true;
    setSyncStatus('syncing');
    try {
      const token = deviceRef.current.token;

      // 1. Upload anything not yet on the server.
      for (;;) {
        const pending = await db.events.where('synced').equals(0).limit(PUSH_BATCH).toArray();
        if (!pending.length) break;
        const { accepted } = await api<{ accepted: string[] }>(
          'POST',
          '/device/events',
          { events: pending.map(({ id, type, ts, payload }) => ({ id, type, ts, payload })) },
          token,
        );
        // Anything the server refused as invalid will never be accepted; don't retry it forever.
        await db.events.bulkUpdate(pending.map((e) => ({ key: e.id, changes: { synced: 1 as const } })));
        if (accepted.length < pending.length) console.warn('server skipped', pending.length - accepted.length, 'events');
      }

      // 2. Look changes made while offline.
      if (deviceRef.current.profilePending) {
        const { learner } = await api<{ learner: LearnerDTO }>(
          'PATCH',
          '/device/me',
          { avatar: deviceRef.current.learner.avatar, theme: deviceRef.current.learner.theme },
          token,
        );
        await saveDevice({ ...deviceRef.current, learner, profilePending: false });
      } else {
        // 3. Pick up settings the parent changed.
        const { learner } = await api<{ learner: LearnerDTO }>('GET', '/device/me', undefined, token);
        if (JSON.stringify(learner) !== JSON.stringify(deviceRef.current.learner)) {
          await saveDevice({ ...deviceRef.current, learner });
        }
      }

      // 4. Download events from other phones (or after a reinstall).
      let lastSeq = deviceRef.current.lastSeq;
      for (;;) {
        const page = await api<EventsPage>('GET', `/device/events?since=${lastSeq}`, undefined, token);
        if (page.events.length) {
          const known = new Set((await db.events.bulkGet(page.events.map((e) => e.id))).filter(Boolean).map((e) => e!.id));
          const fresh: StoredEvent[] = page.events
            .filter((e) => !known.has(e.id))
            .map((e) => ({ ...e, learnerId, synced: 1 }));
          if (fresh.length) {
            await db.events.bulkPut(fresh);
            setEvents((prev) => [...prev, ...fresh]);
          }
        }
        lastSeq = page.lastSeq;
        if (!page.more) break;
      }
      if (lastSeq !== deviceRef.current.lastSeq) await saveDevice({ ...deviceRef.current, lastSeq });


      setSyncStatus('synced');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // The parent unlinked this phone.
        await db.events.clear();
        await setDevice(null);
        onUnpaired();
        return;
      }
      setSyncStatus('offline');
    } finally {
      syncing.current = false;
      if (again.current) {
        again.current = false;
        void sync();
      }
    }
  }, [learnerId, onUnpaired, saveDevice]);

  const scheduleSync = useCallback(
    (delay = 1500) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void sync(), delay);
    },
    [sync],
  );

  useEffect(() => {
    let cancelled = false;
    void loadEvents(learnerId).then((stored) => {
      if (cancelled) return;
      setEvents(stored);
      setLoaded(true);
      void sync();
    });
    const onOnline = () => scheduleSync(0);
    const onVisible = () => document.visibilityState === 'visible' && scheduleSync(0);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => void sync(), 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
      window.clearTimeout(timer.current);
    };
  }, [learnerId, sync, scheduleSync]);

  const addEvents = useCallback(
    (pending: PendingEvent[]) => {
      const now = Date.now();
      const created: StoredEvent[] = pending.map((p, i) => ({
        id: newId(),
        learnerId,
        type: p.type,
        // Keep order stable for events created in the same millisecond.
        ts: now + i,
        payload: p.payload,
        synced: 0,
      }));
      setEvents((prev) => [...prev, ...created]);
      void db.events.bulkAdd(created).then(() => scheduleSync());
      return created;
    },
    [learnerId, scheduleSync],
  );

  const updateLook = useCallback(
    (look: { avatar?: string; theme?: string }) => {
      const next = { ...deviceRef.current, learner: { ...deviceRef.current.learner, ...look }, profilePending: true };
      void saveDevice(next).then(() => scheduleSync(0));
    },
    [saveDevice, scheduleSync],
  );

  const settings = useMemo(() => withDefaults(device.learner.settings), [device.learner.settings]);
  const state = useMemo(() => deriveState(events, settings), [events, settings]);

  const value: LearnerCtx = {
    learner: device.learner,
    settings,
    events,
    state,
    loaded,
    syncStatus,
    addEvents,
    updateLook,
    token: device.token,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
