/** Shapes of the JSON the see-plan server returns. Kept in one place so the pages agree on them. */

export const SEVERITIES = ['low', 'medium', 'high', 'send_to_it'] as const;
export type Severity = (typeof SEVERITIES)[number];
export type SeverityFilter = Severity | 'unrated';

export type ProjectView = { key: string; name: string; root: string; url: string };

export type DataPage<T> = {
  items: T[];
  page: number;
  pages: number;
  total: number;
  options?: string[];
  counts?: Record<string, number>;
};

export type ErrorItem = {
  id?: string;
  claude_session_id: string;
  uuid: string;
  part: number;
  role?: string;
  kind?: string;
  text: string;
  truncated?: boolean;
  severity?: string | null;
  reason?: string | null;
  claude_title?: string | null;
  review_key?: string | null;
  file?: string | null;
  reported_at?: string;
};

export type ErrorsSummary = {
  counts: {
    session: Record<string, number> & { all: number };
    plan: Record<string, number> & { all: number };
  };
  plans: number;
};

export type PlanItem = {
  name: string;
  title?: string | null;
  file?: string;
  review_key?: string | null;
  created_at?: string;
  status?: string;
  error_count?: number;
  worst_severity?: string | null;
};

export type SessionItem = {
  id: string;
  title?: string | null;
  cwd?: string;
  project?: string;
  modified_at?: string;
  review_key?: string | null;
  stage?: string | null;
  error_count?: number;
  worst_severity?: string | null;
};

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  message: string;
  at?: string;
  read?: boolean;
  domain?: string;
};

export type DeletionRule = { type: string; threshold: number; deleteCount?: number };
export type DataConfig = { config: { deletionRule: DeletionRule }; dir: string };

export const STAGES = ['plan', 'interrogation', 'implementation', 'verification'] as const;
export type Stage = (typeof STAGES)[number];
export type StageStatus = 'locked' | 'current' | 'done' | 'skipped';

export type HomeSession = {
  key: string;
  file: string;
  url: string;
  status: string;
  ended_by?: string | null;
  agent?: string | null;
  stage?: Stage | null;
  workflow_id?: string | null;
  updated_at: string;
};

export type Workflow = {
  id: string;
  name: string;
  dir: string;
  current?: Stage | null;
  updated_at: string;
  stages?: Partial<Record<Stage, { status: StageStatus; key?: string | null }>>;
};

export type HomeData = { sessions: HomeSession[]; workflows: Workflow[] };

export type LogEntry = {
  uuid?: string;
  part?: number;
  role?: string;
  kind?: string;
  at?: string;
  text?: string;
};
export type LogRow = LogEntry & { seq: number };

/** What /api/claude-sessions/:id/log answers. */
export type LogBody = {
  claude_session_id?: string;
  found: boolean;
  entries?: unknown[];
  next?: number;
  omitted?: boolean;
  last_prompt_at?: string | null;
  reported?: string[];
  severities?: unknown;
  reasons?: unknown;
};

/** The transcript as the page holds it: entries from every poll so far, and which of them are logged. */
export type LogState = {
  id: string;
  found: boolean;
  entries: LogRow[];
  next: number | null;
  counter: number;
  omitted: boolean;
  lastPromptAt: string | null;
  reported: Record<string, boolean>;
  severities: Record<string, Severity>;
  reasons: Record<string, string>;
  /** True when the reader was at the bottom, so the page scrolls to the new entries. */
  stick: boolean;
};
