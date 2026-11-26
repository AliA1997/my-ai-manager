import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { parseUsage } from '../../lib/help';
import { helpQuery } from '../../lib/queries';
import { PageHeader } from '../shared/PageHeader';

/** The Help page: how to use see from a terminal or an agent, with the CLI's own command list. */
export function HelpPage() {
  const { data } = useSuspenseQuery(helpQuery());
  const commands = useMemo(() => parseUsage(data.usage), [data.usage]);
  return (
    <>
      <title>Help · My AI Manager</title>
      <PageHeader title="Help" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 pb-12">
        <section aria-labelledby="start-title" className="flex flex-col gap-2">
          <h2 id="start-title" className="text-lg font-semibold text-fg">
            Getting started
          </h2>
          <ol className="list-decimal pl-5 text-fg">
            <li>
              Open the dashboard with <code>npm start</code>, or <code>see-plan</code> with no arguments.
            </li>
            <li>
              Press <em>+ New feature</em> and <em>Start Claude</em>, or ask Claude Code to run{' '}
              <code>see &lt;plan file&gt;</code>.
            </li>
            <li>Click the plan to leave notes, then press Send to Agent. Claude answers in the same page.</li>
          </ol>
        </section>
        <section aria-labelledby="commands-title" className="flex flex-col gap-2">
          <h2 id="commands-title" className="text-lg font-semibold text-fg">
            Commands <span className="text-sm font-normal text-muted">see {data.version}</span>
          </h2>
          <p className="text-muted">
            The same list as <code>see --help</code>. Agents use these; you rarely need to.
          </p>
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">see commands</caption>
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-1 pr-4 font-medium">
                  Command
                </th>
                <th scope="col" className="py-1 font-medium">
                  What it does
                </th>
              </tr>
            </thead>
            <tbody>
              {commands.map((c) => (
                <tr key={c.command} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-4 font-mono font-normal text-fg">
                    {c.command}
                  </th>
                  <td className="py-2 break-words text-fg">{c.about}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
