import { memo } from 'react';

type Props = { message: string; isError?: boolean };

/** A live region (A11Y-8): loading, saved and error messages are announced, never color alone. */
export const StatusLine = memo(function StatusLine({ message, isError = false }: Props) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`min-h-6 px-6 pt-2 ${isError ? 'text-danger' : 'text-muted'}`}
    >
      {message}
    </p>
  );
});
