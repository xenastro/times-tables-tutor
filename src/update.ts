import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { NAVIGATE_EVENT } from './router';

/**
 * Keeps every phone on the latest release without interrupting a child mid-activity.
 * A new version downloads in the background and waits (a plain refresh doesn't switch it in);
 * it's applied with a reload only at a calm moment:
 * - as soon as it's ready, if nobody has touched the screen since the app was opened or came back;
 * - when the app goes into the background;
 * - when moving to another screen.
 * Never during a practice, lesson or game, where it waits for the child to leave.
 */
const BUSY = /^\/(practice|lesson\/|games\/)/;
const CHECK_EVERY = 60 * 60 * 1000;

let ready = false;
let touched = false;
let applying = false;
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

const busy = () => BUSY.test(window.location.pathname);

export async function applyUpdate() {
  if (applying || !updateSW) return;
  applying = true;
  const waiting = (await navigator.serviceWorker.getRegistration())?.waiting;
  // Another tab may have switched it in already: this page just needs the new files.
  if (!waiting) return window.location.reload();
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  void updateSW();
}

const applyIfCalm = () => {
  if (ready && !busy()) void applyUpdate();
};

export function startUpdates() {
  updateSW = registerSW({
    onNeedRefresh() {
      ready = true;
      listeners.forEach((l) => l());
      if (!touched || document.visibilityState === 'hidden') applyIfCalm();
    },
    // We reload ourselves (above): the library only does it for a version found since this page
    // opened, not one already waiting from before a refresh.
    onNeedReload() {},
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Phones keep an installed app open for days, so look for a new version now and then.
      const check = () => {
        if (!ready && navigator.onLine) void registration.update().catch(() => undefined);
      };
      setInterval(check, CHECK_EVERY);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => (touched = true), { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') applyIfCalm();
    // Coming back to the app is like opening it again.
    else touched = false;
  });
  window.addEventListener('popstate', applyIfCalm);
  window.addEventListener(NAVIGATE_EVENT, applyIfCalm);
}

/** True once a new version is waiting (for the rare case it can't be applied on its own). */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready,
  );
}
