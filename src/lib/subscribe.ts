import { useCallback, useSyncExternalStore } from 'react';

/**
 * Browser events and timers as external stores. useSyncExternalStore adds the listener when the component mounts
 * and removes it when it unmounts, so the page needs no effect hook (FE-10). A new handler re-subscribes.
 */
const never = (): undefined => undefined;

export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
): void {
  const subscribe = useCallback(
    (notify: () => void) => {
      void notify;
      window.addEventListener(type, handler);
      return () => window.removeEventListener(type, handler);
    },
    [type, handler],
  );
  useSyncExternalStore(subscribe, never, never);
}

export function useDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
): void {
  const subscribe = useCallback(
    (notify: () => void) => {
      void notify;
      document.addEventListener(type, handler);
      return () => document.removeEventListener(type, handler);
    },
    [type, handler],
  );
  useSyncExternalStore(subscribe, never, never);
}

const noTimer = (): (() => void) => () => undefined;

/** The time in whole seconds, re-read every second while `active` (a launch clock). 0 while idle. */
export function useSecondClock(active: boolean): number {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!active) return noTimer();
      const timer = setInterval(notify, 1000);
      return () => clearInterval(timer);
    },
    [active],
  );
  return useSyncExternalStore(
    subscribe,
    () => (active ? Math.floor(Date.now() / 1000) * 1000 : 0),
    () => 0,
  );
}
