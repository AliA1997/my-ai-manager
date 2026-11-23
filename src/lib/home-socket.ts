import { useSyncExternalStore } from 'react';
import { parseHomeMessage } from './home';
import type { HomeData } from './types';

/**
 * Live dashboard updates from /events/home, as an external store. useSyncExternalStore subscribes and
 * unsubscribes for us, so no effect hook (FE-10). The socket opens with the first listener and closes with the last.
 */
const RECONNECT_DELAYS_MS = [1000, 2000, 5000];

let latest: HomeData | null = null;
let socket: WebSocket | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function connect(): void {
  if (typeof WebSocket === 'undefined') return;
  try {
    socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/events/home`,
    );
  } catch {
    return schedule();
  }
  socket.addEventListener('open', () => {
    attempt = 0;
  });
  socket.addEventListener('message', (event: MessageEvent) => {
    const data = parseHomeMessage(event.data);
    if (data) {
      latest = data;
      emit();
    }
  });
  socket.addEventListener('close', () => {
    socket = null;
    if (listeners.size > 0) schedule();
  });
}

function schedule(): void {
  const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 5000;
  attempt += 1;
  timer = setTimeout(connect, delay);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      socket?.close();
      socket = null;
      latest = null;
    }
  };
}

/** The last pushed snapshot, or null before the first push (the loader's data is used then). */
export function useHomePush(): HomeData | null {
  return useSyncExternalStore(
    subscribe,
    () => latest,
    () => null,
  );
}
