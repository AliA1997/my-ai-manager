import { memo } from 'react';

/**
 * Whether a Claude agent is connected, always visible at the top of the dashboard. When none is, one button
 * explains how to connect (the same dialog that opens on first load).
 */
export const AgentStrip = memo(function AgentStrip({
  connected,
  onConnect,
}: {
  connected: boolean;
  onConnect: () => void;
}) {
  return (
    <section
      aria-label="Claude connection"
      className="mx-6 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2"
    >
      <span
        aria-hidden="true"
        className={`size-2.5 rounded-full ${connected ? 'bg-green-600' : 'bg-danger'}`}
      />
      <p role="status" aria-live="polite" className="text-fg">
        {connected ? 'Claude is connected.' : 'No Claude agent is connected.'}
      </p>
      {connected ? null : (
        <button
          type="button"
          onClick={onConnect}
          className="rounded-md bg-accent px-3 py-1 font-medium text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Connect Claude
        </button>
      )}
    </section>
  );
});
