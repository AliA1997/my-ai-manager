import { Link, useRouterState } from '@tanstack/react-router';
import { memo, type ReactNode } from 'react';

type Props = {
  title: string;
  /** Page actions shown after the page links (for example a "New feature" button). */
  links?: ReactNode;
  /** Where the "Claude logs" and "Error logs" links go: a page passes its own project filter. */
  claudeHref?: string;
  errorsHref?: string;
};

export const linkClass =
  'text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent';

const tab =
  'rounded-md px-3 py-1 text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_0_-2px_0_var(--color-accent)]';

/** The page banner: product name, one h1 (A11Y-9), the page links (the current one marked) and the sign-out form. */
export const PageHeader = memo(function PageHeader({
  title,
  links,
  claudeHref = '/claude',
  errorsHref = '/errors',
}: Props) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const here = (to: string): 'page' | undefined => (path === to ? 'page' : undefined);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Claude Manager</p>
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
      </div>
      <nav aria-label="Pages" className="flex flex-wrap items-center gap-1">
        <a href="/" aria-current={here('/')} className={tab}>
          Dashboard
        </a>
        <a href={claudeHref} aria-current={here('/claude')} className={tab}>
          Claude logs
        </a>
        {errorsHref === '/errors' ? (
          <Link to="/errors" aria-current={here('/errors')} preload="intent" className={tab}>
            Error logs
          </Link>
        ) : (
          <a href={errorsHref} aria-current={here('/errors')} className={tab}>
            Error logs
          </a>
        )}
        <Link to="/notifications" aria-current={here('/notifications')} preload="intent" className={tab}>
          Notifications
        </Link>
        <Link to="/help" aria-current={here('/help')} preload="intent" className={tab}>
          Help
        </Link>
        {links ? <span className="ml-2 flex items-center gap-3">{links}</span> : null}
        <form
          method="post"
          action="/api/auth/signout"
          title="Sign out this browser and disconnect the agent"
          className="ml-2"
        >
          <button
            type="submit"
            className="rounded-md border border-line px-3 py-1 text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
          >
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
});

/** In-app navigation (no reload) between the pages that are already React routes. */
export function PageLink({
  to,
  children,
}: {
  to: '/errors' | '/notifications' | '/help';
  children: ReactNode;
}) {
  return (
    <Link to={to} preload="intent" className={linkClass}>
      {children}
    </Link>
  );
}
