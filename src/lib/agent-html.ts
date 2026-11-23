/**
 * The agent's chat text arrives as Markdown the server has already rendered to a small, escaped set of tags.
 * It is read here into plain nodes and drawn as React elements, so no markup string is ever put into the page
 * (SEC-4). Any tag outside the set is dropped and its text kept; links must be http(s).
 */
export type AgentTag = 'p' | 'strong' | 'em' | 'code' | 'pre' | 'ul' | 'ol' | 'li' | 'a' | 'br';
export type AgentNode = string | { tag: AgentTag; href?: string; children: AgentNode[] };

const TAGS: readonly string[] = ['p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'br'];
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
};

export const decodeEntities = (s: string): string =>
  s.replace(/&(amp|lt|gt|quot|apos|#39|#x27);/g, (_, name: string) => ENTITIES[name] ?? '');

const TOKEN = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)|(<)/gi;

type Open = { tag: AgentTag; href?: string; children: AgentNode[] };

export function parseAgentHtml(html: string): AgentNode[] {
  const root: AgentNode[] = [];
  const stack: Open[] = [];
  const add = (node: AgentNode): void => {
    (stack.length ? stack[stack.length - 1]?.children : root)?.push(node);
  };
  for (const m of html.matchAll(TOKEN)) {
    const [, closing, rawTag, attrs, body, stray] = m;
    if (body !== undefined) add(decodeEntities(body));
    else if (stray !== undefined) add('<');
    else if (rawTag !== undefined && TAGS.includes(rawTag.toLowerCase())) {
      const tag = rawTag.toLowerCase() as AgentTag;
      if (tag === 'br') {
        if (!closing) add({ tag, children: [] });
      } else if (closing) {
        const at = stack.map((n) => n.tag).lastIndexOf(tag);
        if (at >= 0) stack.length = at;
      } else {
        const node: Open = { tag, children: [] };
        const href = tag === 'a' ? /href="([^"]*)"/i.exec(attrs ?? '')?.[1] : undefined;
        const url = href === undefined ? '' : decodeEntities(href);
        if (/^https?:\/\//i.test(url)) node.href = url;
        add(node);
        stack.push(node);
      }
    }
  }
  return root;
}
