import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkFileRefs } from './remarkFileRefs';
import { useClaude } from './ClaudeContext';
import styles from './ClaudeView.module.css';

interface MarkdownContentProps {
  text: string;
}

// Anchor props plus the data-cg-* attributes remarkFileRefs attaches to file refs.
type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  'data-cg-file'?: string;
  'data-cg-line'?: string;
  'data-cg-end'?: string;
};

const remarkPlugins = [remarkGfm, remarkFileRefs];

export function MarkdownContent({ text }: MarkdownContentProps) {
  const { openFileRef } = useClaude();

  const components = useMemo(
    () => ({
      a: ({ href, children, ...rest }: AnchorProps) => {
        // File references injected by remarkFileRefs carry data-cg-* attributes
        // and open in the editor view instead of navigating away. Only the file
        // name is shown — the full path lives in the title tooltip — since paths
        // get long and the basename is enough to recognise the ref at a glance.
        const file = rest['data-cg-file'];
        if (file) {
          const startLine = Number(rest['data-cg-line']) || 1;
          const lineSpan = rest['data-cg-end']
            ? `${startLine}-${rest['data-cg-end']}`
            : String(startLine);
          const baseName = file.slice(file.lastIndexOf('/') + 1);
          return (
            <a
              href="#"
              className={styles.fileRef}
              title={`${file}:${lineSpan}`}
              onClick={(e) => {
                e.preventDefault();
                openFileRef(file, startLine);
              }}
            >
              {baseName}:{lineSpan}
            </a>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
          </a>
        );
      },
    }),
    [openFileRef],
  );

  return (
    <div className={styles.md}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>{text}</ReactMarkdown>
    </div>
  );
}
