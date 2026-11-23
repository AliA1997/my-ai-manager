import { STAGES, type HomeData, type HomeSession, type Stage, type Workflow } from './types';

/** Pure helpers for the dashboard: sorting, labels and lookups. Kept out of the components so they are testable (FE-13). */

export const STAGE_TITLES: Record<Stage, string> = {
  plan: 'Plan',
  interrogation: 'Interrogation',
  implementation: 'Implementation',
  verification: 'Verification',
};

export { STAGES };

const newest = (a: { updated_at: string }, b: { updated_at: string }): number =>
  String(b.updated_at).localeCompare(String(a.updated_at));

export const sortWorkflows = (list: readonly Workflow[]): Workflow[] => [...list].sort(newest);

/** Open sessions and finished ones, newest first. */
export function splitSessions(sessions: readonly HomeSession[]): {
  live: HomeSession[];
  done: HomeSession[];
} {
  return {
    live: sessions.filter((s) => s.status !== 'ended').sort(newest),
    done: sessions.filter((s) => s.status === 'ended').sort(newest),
  };
}

export function sessionStatus(
  s: Pick<HomeSession, 'status' | 'ended_by'>,
): 'approved' | 'ended' | 'notes waiting' | 'open' {
  if (s.status === 'ended') return s.ended_by === 'approved' ? 'approved' : 'ended';
  return s.status === 'feedback' ? 'notes waiting' : 'open';
}

export function agentLabel(s: Pick<HomeSession, 'agent'> | null | undefined): string {
  if (!s?.agent) return '';
  return s.agent === 'working' ? 'agent working' : 'agent connected';
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.round((now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}

export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i > 0 ? path.slice(0, i) : '';
}

export function featureName(s: Pick<HomeSession, 'workflow_id'>, workflows: readonly Workflow[]): string {
  if (!s.workflow_id) return '';
  return workflows.find((w) => w.id === s.workflow_id)?.name ?? 'feature';
}

/** The folder the New feature form starts with: the newest feature's, else the newest loose session's. */
export function defaultDir({ sessions, workflows }: HomeData): string {
  const wf = sortWorkflows(workflows)[0];
  if (wf) return wf.dir;
  const loose = sessions.filter((s) => !s.workflow_id).sort(newest)[0];
  return loose ? dirName(loose.file) : '';
}

/** Checks a pushed message before it replaces the page data (SEC-12). */
export function parseHomeMessage(raw: unknown): HomeData | null {
  let msg: unknown = raw;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const m = msg as { type?: unknown; sessions?: unknown; workflows?: unknown } | null;
  if (!m || m.type !== 'sessions' || !Array.isArray(m.sessions)) return null;
  return {
    sessions: m.sessions as HomeSession[],
    workflows: Array.isArray(m.workflows) ? (m.workflows as Workflow[]) : [],
  };
}
