import { newPromptId, SOURCE, type QueuedPrompt } from './session';

/**
 * The sandboxed artifact frame and the DOM snapshots taken from it. The frame has an opaque origin, so messages
 * go to it with targetOrigin "*" and come back only when event.source is the frame's own window (SEC-6).
 */
export const SNAPSHOT_TIMEOUT_MS = 5000;
export const HIGHLIGHT_LIMIT = 20;

export function postToFrame(frame: HTMLIFrameElement | null, message: Record<string, unknown>): void {
  try {
    frame?.contentWindow?.postMessage({ ...message, source: SOURCE }, '*');
  } catch {
    // frame not ready: nothing to do
  }
}

/** A message from the frame, or null when it is not one of ours. */
export function frameMessage(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
): Record<string, unknown> | null {
  if (!frame || event.source !== frame.contentWindow) return null;
  const data: unknown = event.data;
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  return message.source === SOURCE && typeof message.type === 'string' ? message : null;
}

const waiters = new Map<string, (html: string) => void>();

/** The frame answers a "snapshot" message with the same id. */
export function resolveSnapshot(id: unknown, html: unknown): void {
  if (typeof id === 'string') waiters.get(id)?.(typeof html === 'string' ? html : '');
}

/** The frame's DOM as HTML, or '' if it does not answer within the timeout. */
export function requestSnapshot(frame: HTMLIFrameElement | null): Promise<string> {
  return new Promise((resolve) => {
    const id = newPromptId();
    const finish = (html: string): void => {
      clearTimeout(timer);
      waiters.delete(id);
      resolve(html);
    };
    const timer = setTimeout(() => finish(''), SNAPSHOT_TIMEOUT_MS);
    waiters.set(id, finish);
    postToFrame(frame, { type: 'requestSnapshot', id });
  });
}

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The top-level blocks whose text changed between two DOM snapshots, as selectors. */
export function changedBlocks(before: string, after: string): string[] {
  if (!before || !after || typeof DOMParser === 'undefined') return [];
  const parser = new DOMParser();
  const a = parser.parseFromString(before, 'text/html').body;
  const b = parser.parseFromString(after, 'text/html').body;
  const old = new Set(Array.from(a.children, textOf));
  const out: string[] = [];
  Array.from(b.children).forEach((el, i) => {
    const text = textOf(el);
    if (text && !old.has(text)) out.push(`body > :nth-child(${i + 1})`);
  });
  return out.length > HIGHLIGHT_LIMIT ? [] : out; // a rewrite of everything is not worth outlining
}

/** M6: with several outputs, the snapshot covers only the outputs that have notes, each labeled. */
export function snapshotFor(
  outputCount: number,
  batch: readonly QueuedPrompt[],
  snapshots: Record<string, string>,
  current: string,
): string {
  if (outputCount < 2) return current;
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const p of batch) {
    if (p.output && !seen.has(p.output) && snapshots[p.output]) {
      seen.add(p.output);
      ids.push(p.output);
    }
  }
  return ids.map((id) => `<!-- see output: ${id} -->\n${snapshots[id]}`).join('\n');
}

/** Where the frame was last scrolled to, if it said so with a finite pair. */
export function scrollOf(message: Record<string, unknown>): { x: number; y: number } | null {
  const x = Number(message.x);
  const y = Number(message.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
