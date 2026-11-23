import type { ProjectView } from './types';

export const ERROR_TABS = [
  { id: 'session-errors', title: 'Session Error Logs' },
  { id: 'plan-errors', title: 'Plan Error Logs' },
  { id: 'plans', title: 'Plans' },
  { id: 'sessions', title: 'Sessions' },
] as const;

export type TabId = (typeof ERROR_TABS)[number]['id'];
export type ErrorTab = (typeof ERROR_TABS)[number];

/** D13: outside a project the page has only the Sessions tab. */
export const SESSIONS_ONLY_TABS: readonly ErrorTab[] = ERROR_TABS.filter((t) => t.id === 'sessions');

/** Which /api/errors context each error tab reads. */
export const TAB_CONTEXT: Partial<Record<TabId, 'session' | 'plan'>> = {
  'session-errors': 'session',
  'plan-errors': 'plan',
};

export const PROJECT_KEY = /^[0-9a-f]{16}$/;

export const isTabId = (value: unknown): value is TabId => ERROR_TABS.some((t) => t.id === value);

export const tabsFor = (project: ProjectView | null): readonly ErrorTab[] =>
  project ? ERROR_TABS : SESSIONS_ONLY_TABS;

export function findProject(projects: readonly ProjectView[], key: string | undefined): ProjectView | null {
  return key ? (projects.find((p) => p.key === key) ?? null) : null;
}

/** The tab to show: the asked one if this mode has it, otherwise the first. */
export function resolveTab(tab: TabId | undefined, project: ProjectView | null): TabId {
  const tabs = tabsFor(project);
  return tabs.find((t) => t.id === tab)?.id ?? tabs[0]?.id ?? 'sessions';
}
