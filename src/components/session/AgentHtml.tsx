import { memo, type ReactNode } from 'react';
import { parseAgentHtml, type AgentNode } from '../../lib/agent-html';

/** Links open in a new tab and never see this page (A11Y-7). */
const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

function draw(nodes: readonly AgentNode[]): ReactNode[] {
  return nodes.map((node, i) => {
    if (typeof node === 'string') return node;
    const key = `${node.tag}-${i}`;
    const kids: ReactNode[] = draw(node.children);
    switch (node.tag) {
      case 'br':
        return <br key={key} />;
      case 'a':
        return node.href ? (
          <a key={key} href={node.href} {...external} className="text-link underline">
            {kids}
          </a>
        ) : (
          kids
        );
      case 'pre':
        return (
          <pre key={key} className="my-1 overflow-auto rounded-md bg-page p-2 text-xs">
            {kids}
          </pre>
        );
      case 'code':
        return (
          <code key={key} className="rounded bg-page px-1 text-xs">
            {kids}
          </code>
        );
      case 'strong':
        return <strong key={key}>{kids}</strong>;
      case 'em':
        return <em key={key}>{kids}</em>;
      case 'ul':
        return (
          <ul key={key} className="my-1 list-disc pl-5">
            {kids}
          </ul>
        );
      case 'ol':
        return (
          <ol key={key} className="my-1 list-decimal pl-5">
            {kids}
          </ol>
        );
      case 'li':
        return <li key={key}>{kids}</li>;
      default:
        return (
          <p key={key} className="my-1">
            {kids}
          </p>
        );
    }
  });
}

/** The agent's rendered Markdown, drawn as elements from a whitelist (SEC-4). */
export const AgentHtml = memo(function AgentHtml({ html }: { html: string }) {
  return <>{draw(parseAgentHtml(html))}</>;
});
