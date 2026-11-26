import { Link, useRouterState } from '@tanstack/react-router';
import { memo, type ReactNode } from 'react';

type Props = {
  title: string;
  /** Page actions shown after the page links (for example a "New feature" button). */
  links?: ReactNode;
  /** Where the "Claude logs" and "Error logs" links go: a page passes its own project filter. */
  claudeHref?: string;
  errorsHref?: string;
  /** Show the visible h1 row under the bar. A page with its own h1 (the session review page) passes false (A11Y-9). */
  showTitle?: boolean;
};

export const linkClass =
  'text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent';

const tab =
  'inline-flex items-center min-h-10 px-4 py-1.5 text-[15px] font-semibold whitespace-nowrap text-white rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white aria-[current=page]:bg-white/25';

/** The page banner: product name, one h1 (A11Y-9), the page links (the current one marked) and the sign-out form. */
export const PageHeader = memo(function PageHeader({
  title,
  links,
  claudeHref = '/claude',
  errorsHref = '/errors',
  showTitle = true,
}: Props) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const here = (to: string): 'page' | undefined => (path === to ? 'page' : undefined);
  return (
    <header className="sticky top-0 z-20">
      <div className="flex items-center gap-5 min-h-16 px-6 py-2.5 text-white bg-[linear-gradient(100deg,var(--color-grad-a),var(--color-grad-b)_55%,var(--color-grad-c))] shadow-[0_2px_10px_rgba(30,22,38,.18)]">
        <a
          href="/"
          className="flex flex-none items-center gap-2.5 text-lg font-bold whitespace-nowrap text-white"
        >
          My AI Manager
        </a>
        <nav
          aria-label="Pages"
          className="flex flex-1 items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none]"
        >
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
          {links ? <span className="flex items-center gap-3 ml-2">{links}</span> : null}
          <form
            method="post"
            action="/api/auth/signout"
            title="Sign out this browser and disconnect the agent"
            className="ml-2"
          >
            <button
              type="submit"
              className="min-h-10 px-4 font-semibold text-white bg-black/20 rounded-full hover:bg-black/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
      {showTitle ? (
        <div className="px-6 pt-6">
          <h1 className="text-2xl font-semibold text-fg">{title}</h1>
        </div>
      ) : null}
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
