import type { Launch, QueuedPrompt } from './session';

/** The review page's own, client-only state: what is typed, queued, shown and open. A pure reducer (testable). */
export type Hint = { text: string; error: boolean };

export type UiState = {
  queue: QueuedPrompt[];
  sending: boolean;
  annotate: boolean;
  hint: Hint;
  currentOutput: string;
  /** The revision of each output the person has looked at, so a tab can show it changed meanwhile. */
  seen: Record<string, number>;
  /** An older revision shown read-only in the frame, and the latest revision when it was opened. */
  viewing: { n: number; html: string; latest: number } | null;
  tab: 'chat' | 'log';
  launch: Launch | null;
};

export type UiAction =
  | { type: 'queue'; queue: QueuedPrompt[] }
  | { type: 'sending'; on: boolean }
  | { type: 'annotate'; on: boolean }
  | { type: 'hint'; text: string; error?: boolean }
  | { type: 'output'; id: string; revision: number; annotate: boolean }
  | { type: 'viewing'; viewing: UiState['viewing'] }
  | { type: 'tab'; tab: UiState['tab'] }
  | { type: 'launch'; launch: Launch | null };

export const noHint: Hint = { text: '', error: false };

export function initialUi(queue: QueuedPrompt[], annotate: boolean): UiState {
  return {
    queue,
    sending: false,
    annotate,
    hint: noHint,
    currentOutput: 'main',
    seen: {},
    viewing: null,
    tab: 'chat',
    launch: null,
  };
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'queue':
      return { ...state, queue: action.queue, hint: noHint };
    case 'sending':
      return { ...state, sending: action.on };
    case 'annotate':
      return { ...state, annotate: action.on };
    case 'hint':
      return { ...state, hint: { text: action.text, error: action.error === true } };
    case 'output':
      return {
        ...state,
        currentOutput: action.id,
        seen: { ...state.seen, [action.id]: action.revision },
        viewing: null,
        annotate: action.annotate,
      };
    case 'viewing':
      return { ...state, viewing: action.viewing };
    case 'tab':
      return { ...state, tab: action.tab };
    case 'launch':
      return { ...state, launch: action.launch };
  }
}

/** The "Viewing revision" bar: a newer revision is mentioned only if one arrived while the old one was open. */
export function revisionBarText(viewing: NonNullable<UiState['viewing']>, latest: number): string {
  return `Viewing revision r${viewing.n} (read-only).${latest !== viewing.latest ? ` A newer revision r${latest} is available.` : ''}`;
}
