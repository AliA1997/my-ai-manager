export type HelpCommand = { command: string; about: string };

/**
 * The CLI prints one line per command: the command, two or more spaces, then what it does. The Help page shows
 * the same lines as a table. A line without that gap is a command with no description.
 */
export function parseUsage(usage: string): HelpCommand[] {
  return usage
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const gap = /\s{2,}/.exec(line);
      return gap
        ? { command: line.slice(0, gap.index), about: line.slice(gap.index + gap[0].length) }
        : { command: line, about: '' };
    });
}
