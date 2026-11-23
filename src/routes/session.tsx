import type { QueryClient } from '@tanstack/react-query';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { SessionSkeleton } from '../components/session/SessionSkeleton';
import { sendJson } from '../lib/api';
import { claudeStatusQuery, sessionPageQuery } from '../lib/queries';
import { isStage, SESSION_KEY, type ChatEntry, type QueuedPrompt } from '../lib/session';
import type { Stage } from '../lib/types';
import { rootRoute } from './__root';

const isClaudeSession = (id: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

/** The route loader: loads the session, with its chat, stage, workflow and outputs, before the page shows (FE-11). */
export async function loader(queryClient: QueryClient, key: string): Promise<void> {
  await queryClient.ensureQueryData(sessionPageQuery(key));
  void queryClient.prefetchQuery(claudeStatusQuery(key)); // the page works without it
}

export type Revision = { n: number; at: string };

export type SessionAction =
  | { intent: 'send'; key: string; prompts: QueuedPrompt[]; domSnapshot: string; end: boolean }
  | { intent: 'end'; key: string }
  | { intent: 'restart'; key: string; path: 'new-session' | 'reopen' }
  | { intent: 'stage'; key: string; stage: Stage | null }
  | {
      intent: 'decision';
      key: string;
      decision: 'approve' | 'request-changes';
      comment: string;
      force: boolean;
    }
  | { intent: 'feedback'; key: string; rating: 'up' | 'down'; categories: string[]; text: string }
  | { intent: 'skip-stage'; key: string; workflowId: string }
  | { intent: 'connect'; key: string; resume: boolean }
  | { intent: 'connect-cancel'; key: string }
  | { intent: 'attach-claude'; key: string; id: string }
  | { intent: 'revisions'; key: string; output: string }
  | { intent: 'revision'; key: string; output: string; n: number };

/** What each intent answers. The server's JSON is read into these shapes, not trusted as is (SEC-12). */
export type SessionResult = {
  chat?: ChatEntry[];
  delivered?: string;
  stage?: Stage | null;
  stageSource?: string | null;
  body?: Record<string, unknown>;
  revisions?: Revision[];
  html?: string;
};

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object';
const revisionSuffix = (output: string): string =>
  output === 'main' ? '' : `?output=${encodeURIComponent(output)}`;

/** The route action: every change the review page makes to a session (FE-11). */
export async function action(input: SessionAction): Promise<SessionResult> {
  if (!SESSION_KEY.test(input.key)) throw new Error('unexpected session key');
  const base = `/api/${input.key}`;
  switch (input.intent) {
    case 'send': {
      const body = await sendJson<{ chat?: unknown; delivered?: unknown }>(`${base}/prompts`, 'POST', {
        prompts: input.prompts,
        dom_snapshot: input.domSnapshot,
        end: input.end,
      });
      if (!Array.isArray(body.chat)) throw new Error('unexpected response');
      return {
        chat: body.chat.filter(isRecord),
        ...(typeof body.delivered === 'string' ? { delivered: body.delivered } : {}),
      };
    }
    case 'end':
    case 'connect-cancel':
      await sendJson(`${base}/${input.intent}`, 'POST', {});
      return {};
    case 'restart':
      await sendJson(`${base}/${input.path}`, 'POST', {});
      return {};
    case 'stage': {
      if (input.stage !== null && !isStage(input.stage)) throw new Error('unexpected stage');
      const body = await sendJson<{ stage?: unknown; stage_source?: unknown }>(`${base}/stage`, 'POST', {
        stage: input.stage,
      });
      return {
        stage: isStage(body.stage) ? body.stage : null,
        stageSource: typeof body.stage_source === 'string' ? body.stage_source : null,
      };
    }
    case 'decision':
      return {
        body: await sendJson<Record<string, unknown>>(`${base}/decision`, 'POST', {
          decision: input.decision,
          comment: input.comment,
          force: input.force,
        }),
      };
    case 'feedback': {
      const body = await sendJson<{ chat?: unknown }>(`${base}/session-feedback`, 'POST', {
        rating: input.rating,
        categories: input.categories,
        text: input.text,
      });
      return Array.isArray(body.chat) ? { chat: body.chat.filter(isRecord) } : {};
    }
    case 'skip-stage':
      return {
        body: await sendJson<Record<string, unknown>>(
          `/api/workflows/${encodeURIComponent(input.workflowId)}/skip`,
          'POST',
          {},
        ),
      };
    case 'connect':
      return {
        body: await sendJson<Record<string, unknown>>(
          `${base}/connect-claude`,
          'POST',
          input.resume ? { resume: true } : {},
        ),
      };
    case 'attach-claude':
      if (!isClaudeSession(input.id)) throw new Error('That is not a Claude session id.');
      await sendJson(`${base}/claude-session`, 'POST', { id: input.id });
      return {};
    case 'revisions': {
      const res = await fetch(`${base}/revisions${revisionSuffix(input.output)}`);
      const body: unknown = await res.json().catch(() => null);
      const list = isRecord(body) && Array.isArray(body.revisions) ? body.revisions : [];
      return {
        revisions: list
          .filter(isRecord)
          .map((r) => ({ n: Number(r.n), at: String(r.at ?? '') }))
          .filter((r) => Number.isInteger(r.n))
          .reverse(),
      };
    }
    case 'revision': {
      if (!Number.isInteger(input.n) || input.n < 0) throw new Error('unexpected revision');
      const res = await fetch(`${base}/revisions/${input.n}${revisionSuffix(input.output)}`);
      const body: unknown = await res.json().catch(() => null);
      if (!isRecord(body) || typeof body.html !== 'string') throw new Error('That revision is gone.');
      return { html: body.html };
    }
  }
}

export const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/session/$key',
  params: {
    parse: ({ key }) => {
      if (!SESSION_KEY.test(key)) throw new Error('unexpected session key'); // SEC-12
      return { key };
    },
  },
  loader: ({ context, params }) => loader(context.queryClient, params.key),
  pendingComponent: SessionSkeleton, // UX-1
  component: lazyRouteComponent(() => import('../components/session/SessionPage'), 'SessionPage'), // PERF-3
});
