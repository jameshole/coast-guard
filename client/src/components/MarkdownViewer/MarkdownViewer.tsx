import { useEffect, useMemo, useState, useRef, useCallback, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createHighlighter, type Highlighter } from 'shiki';
import { useQueryClient } from '@tanstack/react-query';
import { useFileContent } from '../../hooks/useFileContent';
import { api } from '../../services/api';
import styles from './MarkdownViewer.module.css';

interface LineRange {
  startLine: number;
  endLine: number;
}

interface MarkdownViewerProps {
  filePath: string;
  onLineSelectionComplete?: (startLine: number, endLine: number) => void;
  selectedLines?: LineRange | null;
  commentRanges?: LineRange[];
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface SelectableCodeBlockProps {
  language: string;
  code: string;
  /** Source line number of the opening ``` fence */
  fenceStartLine: number;
  onSelect?: (startLine: number, endLine: number) => void;
  selectedLines?: { startLine: number; endLine: number } | null;
  commentedLines?: Set<number>;
}

function SelectableCodeBlock({
  language,
  code,
  fenceStartLine,
  onSelect,
  selectedLines,
  commentedLines,
}: SelectableCodeBlockProps) {
  const [highlightedLines, setHighlightedLines] = useState<string[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const isDragging = useRef(false);

  // Code content starts on the line after the fence
  const codeStartLine = fenceStartLine + 1;
  const codeLines = code.split('\n');

  useEffect(() => {
    getHighlighter()
      .then((highlighter) => {
        const tokens = highlighter.codeToTokens(code, {
          lang: language as Parameters<Highlighter['codeToTokens']>[1]['lang'],
          theme: 'github-dark',
        });
        const htmlLines = tokens.tokens.map((lineTokens) =>
          lineTokens
            .map(
              (token) =>
                `<span style="color: ${token.color || 'inherit'}">${escapeHtml(token.content)}</span>`
            )
            .join('')
        );
        setHighlightedLines(htmlLines);
      })
      .catch(() => {
        setHighlightedLines(codeLines.map(escapeHtml));
      });
  }, [code, language]);

  // Compute active selection (from props or local drag state)
  const dragSelection =
    selectionAnchor !== null && selectionEnd !== null
      ? { startLine: Math.min(selectionAnchor, selectionEnd), endLine: Math.max(selectionAnchor, selectionEnd) }
      : null;
  const activeSelection = dragSelection || selectedLines;

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging.current && selectionAnchor !== null && selectionEnd !== null) {
        isDragging.current = false;
        const start = Math.min(selectionAnchor, selectionEnd);
        const end = Math.max(selectionAnchor, selectionEnd);
        onSelect?.(start, end);
        setSelectionAnchor(null);
        setSelectionEnd(null);
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [selectionAnchor, selectionEnd, onSelect]);

  const lines = highlightedLines.length > 0 ? highlightedLines : codeLines.map(escapeHtml);

  return (
    <div className={styles.codeBlock}>
      <table className={styles.codeTable}>
        <tbody>
          {lines.map((html, i) => {
            const sourceLine = codeStartLine + i;
            const isSelected =
              activeSelection &&
              sourceLine >= activeSelection.startLine &&
              sourceLine <= activeSelection.endLine;
            const hasComment = commentedLines?.has(sourceLine);

            return (
              <tr
                key={i}
                className={`${styles.codeLine} ${isSelected ? styles.selectedCodeLine : ''} ${hasComment ? styles.commentedCodeLine : ''}`}
              >
                <td
                  className={styles.codeLineNumber}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    setSelectionAnchor(sourceLine);
                    setSelectionEnd(sourceLine);
                    isDragging.current = true;
                  }}
                  onMouseEnter={() => {
                    if (isDragging.current) setSelectionEnd(sourceLine);
                  }}
                >
                  {sourceLine}
                </td>
                <td
                  className={styles.codeLineContent}
                  dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Extract text content from a hast node tree
function getTextContent(node: any): string {
  if (node.type === 'text') return node.value || '';
  if (node.children) return node.children.map(getTextContent).join('');
  return '';
}

/** True if the block's line range exactly matches a target range */
function matchesRange(
  startLine: number,
  endLine: number,
  range: LineRange | null | undefined,
): boolean {
  return !!range && range.startLine === startLine && range.endLine === endLine;
}

/** Wraps a block-level markdown element with selectable line-range behavior */
function SelectableBlock({
  node,
  children,
  onSelect,
  selectedLines,
  commentRanges,
}: {
  node: any;
  children: ReactNode;
  onSelect?: (startLine: number, endLine: number) => void;
  selectedLines?: LineRange | null;
  commentRanges?: LineRange[];
}) {
  const startLine = node?.position?.start?.line;
  const endLine = node?.position?.end?.line;

  if (!startLine || !endLine) {
    return <>{children}</>;
  }

  // Match exactly so an outer block (e.g. a parent <ul>) doesn't also light up
  // when a nested block is selected/commented.
  const isSelected = matchesRange(startLine, endLine, selectedLines);
  const hasComment = !!commentRanges?.some((r) => matchesRange(startLine, endLine, r));

  return (
    <div
      className={`${styles.selectableBlock} ${isSelected ? styles.selectedBlock : ''} ${hasComment ? styles.commentedBlock : ''}`}
      onClick={(e) => {
        // Don't trigger on checkbox clicks or link clicks
        if ((e.target as HTMLElement).closest('input, a')) return;
        // Stop bubbling so an outer selectable block (e.g. the parent <ul>) doesn't overwrite this selection
        e.stopPropagation();
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
  selectedLines?: LineRange | null,
  commentRanges?: LineRange[],
) {
  // <li> can't be wrapped in a <div> (invalid HTML inside <ul>/<ol>), so apply the
  // selectable behavior directly to the <li> element itself.
  if (Tag === 'li') {
    return function SelectableLi({ node, children, className, ...props }: any) {
      const startLine = node?.position?.start?.line;
      const endLine = node?.position?.end?.line;

      if (!startLine || !endLine) {
        return <li className={className} {...props}>{children}</li>;
      }

      const isSelected = matchesRange(startLine, endLine, selectedLines);
      const hasComment = !!commentRanges?.some((r) => matchesRange(startLine, endLine, r));

      const combinedClassName = [
        className,
        styles.selectableBlock,
        isSelected ? styles.selectedBlock : '',
        hasComment ? styles.commentedBlock : '',
      ]
        .filter(Boolean)
        .join(' ');

      return (
        <li
          {...props}
          className={combinedClassName}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('input, a')) return;
            // Stop bubbling so the parent <ul>/<ol> (or an ancestor <li>) doesn't overwrite this selection
            e.stopPropagation();
            onSelect?.(startLine, endLine);
          }}
        >
          <span className={styles.lineLabel}>
            {startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`}
          </span>
          {children}
        </li>
      );
    };
  }

  return function WrappedComponent({ node, children, ...props }: any) {
    return (
      <SelectableBlock
        node={node}
        onSelect={onSelect}
        selectedLines={selectedLines}
        commentRanges={commentRanges}
      >
        <Tag {...props}>{children}</Tag>
      </SelectableBlock>
    );
  };
}

export function MarkdownViewer({ filePath, onLineSelectionComplete, selectedLines, commentRanges }: MarkdownViewerProps) {
  const { data: fileData, isLoading, error } = useFileContent(filePath);
  const queryClient = useQueryClient();
  const checkboxIndexRef = useRef(0);

  // Per-line set of commented lines for the code-fence viewer (which highlights individual lines).
  const commentedLines = useMemo(() => {
    const lines = new Set<number>();
    for (const r of commentRanges ?? []) {
      for (let i = r.startLine; i <= r.endLine; i++) lines.add(i);
    }
    return lines;
  }, [commentRanges]);

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
  const blockTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'table', 'hr'] as const;
  const selectableComponents: Record<string, any> = {};
  for (const tag of blockTags) {
    selectableComponents[tag] = makeSelectableComponent(tag, onLineSelectionComplete, selectedLines, commentRanges);
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
              if (codeNode?.tagName === 'code') {
                const classNames = (codeNode.properties?.className as string[]) || [];
                const langMatch = classNames.find((c: string) => /^language-/.test(c));
                const language = langMatch ? langMatch.replace('language-', '') : 'plaintext';
                const code = getTextContent(codeNode).replace(/\n$/, '');
                const fenceStartLine = node?.position?.start?.line ?? 0;
                return (
                  <SelectableCodeBlock
                    language={language}
                    code={code}
                    fenceStartLine={fenceStartLine}
                    onSelect={onLineSelectionComplete}
                    selectedLines={selectedLines}
                    commentedLines={commentedLines}
                  />
                );
              }
              return <pre>{node?.children ? undefined : 'unknown'}</pre>;
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
