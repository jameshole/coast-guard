// remark plugin: turn inline-code file references (`src/App.tsx:42` or
// `src/App.tsx:10-25`) in chat messages into link nodes the UI can intercept
// and open in the editor view. Only backticked references are matched — that's
// how Claude already writes file locations, and it keeps false positives near
// zero. Matches are tagged with data-cg-* attributes rather than a real URL so
// MarkdownContent can render them as internal links.

// Minimal mdast shapes — we only touch the fields we need.
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: { hProperties?: Record<string, string> };
}

// The entire inline-code value must be a project-relative `path:line` (or
// `path:start-end`). Requiring a file extension keeps non-file snippets like
// `x:1` from matching.
const FILE_REF = /^([\w./-]*[\w-]\.[a-zA-Z]\w*):(\d+)(?:-(\d+))?$/;

function transform(node: MdNode): void {
  const children = node.children;
  if (!children) return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'inlineCode' && child.value) {
      const m = FILE_REF.exec(child.value.trim());
      if (m) {
        const [, path, startLine, endLine] = m;
        const hProperties: Record<string, string> = {
          'data-cg-file': path,
          'data-cg-line': startLine,
        };
        if (endLine) hProperties['data-cg-end'] = endLine;
        children[i] = {
          type: 'link',
          url: '#',
          data: { hProperties },
          children: [{ type: 'text', value: child.value }],
        };
      }
    } else if (child.children) {
      transform(child);
    }
  }
}

export function remarkFileRefs() {
  return (tree: MdNode): void => {
    transform(tree);
  };
}
