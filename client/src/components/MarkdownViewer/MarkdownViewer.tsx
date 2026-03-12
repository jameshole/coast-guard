import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createHighlighter, type Highlighter } from 'shiki';
import { useQueryClient } from '@tanstack/react-query';
import { useFileContent } from '../../hooks/useFileContent';
import { api } from '../../services/api';
import styles from './MarkdownViewer.module.css';

interface MarkdownViewerProps {
  filePath: string;
  onLineSelectionComplete?: (startLine: number, endLine: number) => void;
  selectedLines?: { startLine: number; endLine: number } | null;
  commentedLines?: Set<number>;
}

// Highlighter singleton for code blocks
let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: [
        'typescript',
        'javascript',
        'jsx',
        'tsx',
        'json',
        'html',
        'css',
        'python',
        'bash',
        'yaml',
        'markdown',
        'plaintext',
      ],
    });
  }
  return highlighterPromise;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    getHighlighter()
      .then((highlighter) => {
        const highlighted = highlighter.codeToHtml(code, {
          lang: language as Parameters<Highlighter['codeToHtml']>[1]['lang'],
          theme: 'github-dark',
        });
        setHtml(highlighted);
      })
      .catch(() => {
        // Fallback to plain code
        setHtml(null);
      });
  }, [code, language]);

  if (html) {
    return (
      <div
        className={styles.codeBlock}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre className={styles.codeBlock}>
      <code>{code}</code>
    </pre>
  );
}

// Extract text content from a hast node tree
function getTextContent(node: any): string {
  if (node.type === 'text') return node.value || '';
  if (node.children) return node.children.map(getTextContent).join('');
  return '';
}

/** Wraps a block-level markdown element with selectable line-range behavior */
function SelectableBlock({
  node,
  children,
  onSelect,
  selectedLines,
  commentedLines,
}: {
  node: any;
  children: ReactNode;
  onSelect?: (startLine: number, endLine: number) => void;
  selectedLines?: { startLine: number; endLine: number } | null;
  commentedLines?: Set<number>;
}) {
  const startLine = node?.position?.start?.line;
  const endLine = node?.position?.end?.line;

  if (!startLine || !endLine) {
    return <>{children}</>;
  }

  const isSelected =
    selectedLines &&
    startLine <= selectedLines.endLine &&
    endLine >= selectedLines.startLine;

  const hasComment = commentedLines
    ? Array.from({ length: endLine - startLine + 1 }, (_, i) => startLine + i).some(
        (l) => commentedLines.has(l)
      )
    : false;

  return (
    <div
      className={`${styles.selectableBlock} ${isSelected ? styles.selectedBlock : ''} ${hasComment ? styles.commentedBlock : ''}`}
      onClick={(e) => {
        // Don't trigger on checkbox clicks or link clicks
        if ((e.target as HTMLElement).closest('input, a')) return;
        onSelect?.(startLine, endLine);
      }}
    >
      <span className={styles.lineLabel}>
        {startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`}
      </span>
      {children}
    </div>
  );
}

/**
 * Creates a block-level component wrapper that makes the element selectable for commenting.
 * The returned component renders the original HTML tag wrapped in a SelectableBlock.
 */
function makeSelectableComponent(
  Tag: string,
  onSelect?: (startLine: number, endLine: number) => void,
  selectedLines?: { startLine: number; endLine: number } | null,
  commentedLines?: Set<number>,
) {
  return function WrappedComponent({ node, children, ...props }: any) {
    return (
      <SelectableBlock
        node={node}
        onSelect={onSelect}
        selectedLines={selectedLines}
        commentedLines={commentedLines}
      >
        <Tag {...props}>{children}</Tag>
      </SelectableBlock>
    );
  };
}

export function MarkdownViewer({ filePath, onLineSelectionComplete, selectedLines, commentedLines }: MarkdownViewerProps) {
  const { data: fileData, isLoading, error } = useFileContent(filePath);
  const queryClient = useQueryClient();
  const checkboxIndexRef = useRef(0);

  // Reset checkbox index on each render
  checkboxIndexRef.current = 0;

  const handleCheckboxClick = useCallback(
    async (index: number) => {
      try {
        await api.toggleCheckbox(filePath, index);
        // Invalidate the file content query to refetch
        queryClient.invalidateQueries({ queryKey: ['fileContent', filePath] });
      } catch (err) {
        console.error('Failed to toggle checkbox:', err);
      }
    },
    [filePath, queryClient]
  );

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <span>Error loading file: {error.message}</span>
      </div>
    );
  }

  const content = fileData?.content || '';

  // Build selectable wrappers for block-level elements
  const blockTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'table', 'hr'] as const;
  const selectableComponents: Record<string, any> = {};
  for (const tag of blockTags) {
    selectableComponents[tag] = makeSelectableComponent(tag, onLineSelectionComplete, selectedLines, commentedLines);
  }

  return (
    <div className={styles.container}>
      <article className={styles.article}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            ...selectableComponents,
            pre({ node }) {
              // Block code: extract language and text from the hast <code> child
              const codeNode = node?.children?.[0] as any;
              const codeBlock = (() => {
                if (codeNode?.tagName === 'code') {
                  const classNames = (codeNode.properties?.className as string[]) || [];
                  const langMatch = classNames.find((c: string) => /^language-/.test(c));
                  const language = langMatch ? langMatch.replace('language-', '') : 'plaintext';
                  const code = getTextContent(codeNode).replace(/\n$/, '');
                  return <CodeBlock language={language} code={code} />;
                }
                return <pre>{node?.children ? undefined : 'unknown'}</pre>;
              })();

              return (
                <SelectableBlock
                  node={node}
                  onSelect={onLineSelectionComplete}
                  selectedLines={selectedLines}
                  commentedLines={commentedLines}
                >
                  {codeBlock}
                </SelectableBlock>
              );
            },
            code({ children, ...props }) {
              // Only inline code reaches here; block code is handled by pre
              return (
                <code className={styles.inlineCode} {...props}>
                  {children}
                </code>
              );
            },
            a({ href, children }) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            },
            input({ type, checked, disabled, ...props }) {
              if (type === 'checkbox') {
                const currentIndex = checkboxIndexRef.current++;
                return (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleCheckboxClick(currentIndex)}
                    className={styles.checkbox}
                    {...props}
                  />
                );
              }
              return <input type={type} checked={checked} disabled={disabled} {...props} />;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
