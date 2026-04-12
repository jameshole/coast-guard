import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki';
import { useFileContent } from '../../hooks/useFileContent';
import { useFileDiff } from '../../hooks/useGitStatus';
import { DiffGutter } from './DiffGutter';
import type { LineDiff } from '../../types';
import styles from './CodeViewer.module.css';

interface TokenInfo {
  content: string;
  color: string;
  isClickable: boolean;
  offset: number;
}

// A display line can be either from the current file or a removed line from diff
interface DisplayLine {
  type: 'current' | 'removed';
  content: string; // HTML content for removed lines only
  highlightKey?: string; // Key for looking up highlighted content (for removed lines)
  newLineNumber: number | null; // Line number in current file (null for removed)
  oldLineNumber: number | null; // Line number in old file (for removed lines)
  diffType: 'add' | 'remove' | null;
  isStaged: boolean;
}

interface CodeViewerProps {
  filePath: string | null;
  ignoreWhitespace?: boolean;
  selectedLines?: { startLine: number; endLine: number } | null;
  onLineSelectionComplete?: (startLine: number, endLine: number) => void;
  commentedLines?: Set<number>;
  onGoToDefinition?: (filePath: string, offset: number) => void;
  targetLine?: number | null;
}

// Language detection from file extension
const extensionToLanguage: Record<string, BundledLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

function detectLanguage(filePath: string): BundledLanguage {
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  return extensionToLanguage[ext] || 'plaintext';
}

// Highlighter singleton
let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: [
        'typescript',
        'tsx',
        'javascript',
        'jsx',
        'json',
        'markdown',
        'html',
        'css',
        'scss',
        'python',
        'ruby',
        'go',
        'rust',
        'java',
        'kotlin',
        'swift',
        'c',
        'cpp',
        'csharp',
        'php',
        'bash',
        'yaml',
        'toml',
        'xml',
        'sql',
        'graphql',
        'vue',
        'svelte',
        'plaintext',
      ],
    });
  }
  return highlighterPromise;
}

// Check if a token is NOT navigable based on its TextMate scopes.
// Blocklist approach: everything is clickable unless it's clearly not an identifier.
function isIdentifierToken(scopes: string[]): boolean {
  for (const scope of scopes) {
    if (
      scope.startsWith('keyword.') ||
      scope.startsWith('storage.') ||
      scope.startsWith('string.') ||
      scope.startsWith('comment.') ||
      scope.startsWith('punctuation.') ||
      scope.startsWith('constant.numeric') ||
      scope.startsWith('constant.language') ||
      scope.startsWith('constant.character') ||
      scope.startsWith('variable.language') ||
      scope.startsWith('entity.name.tag') ||
      scope.startsWith('entity.name.section') ||
      scope.startsWith('meta.brace') ||
      scope.startsWith('meta.separator')
    ) {
      return false;
    }
  }
  return true;
}

export function CodeViewer({ filePath, ignoreWhitespace = false, selectedLines, onLineSelectionComplete, commentedLines, onGoToDefinition, targetLine }: CodeViewerProps) {
  const { data: fileData, isLoading, error } = useFileContent(filePath);
  const { data: diffData } = useFileDiff(filePath, ignoreWhitespace);
  const [highlightedLines, setHighlightedLines] = useState<TokenInfo[][]>([]);
  const [highlightedRemovedLines, setHighlightedRemovedLines] = useState<Map<string, string>>(new Map());
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [cmdHeld, setCmdHeld] = useState(false);

  // Line selection state for commenting
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track Cmd/Ctrl key state for go-to-definition
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) setCmdHeld(true);
    };
    const handleKeyUp = () => {
      setCmdHeld(false);
    };
    const handleBlur = () => setCmdHeld(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Scroll to target line when it changes
  useEffect(() => {
    if (targetLine && containerRef.current && highlightedLines.length > 0) {
      const targetRow = containerRef.current.querySelector(`tr[data-line="${targetLine}"]`);
      if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [targetLine, highlightedLines]);

  const activeSelection = useMemo(() => {
    if (selectedLines) return selectedLines;
    if (selectionAnchor !== null && selectionEnd !== null) {
      const start = Math.min(selectionAnchor, selectionEnd);
      const end = Math.max(selectionAnchor, selectionEnd);
      return { startLine: start, endLine: end };
    }
    return null;
  }, [selectedLines, selectionAnchor, selectionEnd]);

  const handleLineMouseDown = useCallback((lineNum: number, e: React.MouseEvent) => {
    // Only left click on the line number area
    if (e.button !== 0) return;
    e.preventDefault();
    setSelectionAnchor(lineNum);
    setSelectionEnd(lineNum);
    isDragging.current = true;
  }, []);

  const handleLineMouseEnter = useCallback((lineNum: number) => {
    if (isDragging.current) {
      setSelectionEnd(lineNum);
    }
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging.current && selectionAnchor !== null && selectionEnd !== null) {
        isDragging.current = false;
        const start = Math.min(selectionAnchor, selectionEnd);
        const end = Math.max(selectionAnchor, selectionEnd);
        onLineSelectionComplete?.(start, end);
        // Clear internal selection state since parent now owns it via selectedLines
        setSelectionAnchor(null);
        setSelectionEnd(null);
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [selectionAnchor, selectionEnd, onLineSelectionComplete]);

  const handleTokenClick = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    const offset = e.currentTarget.dataset.offset;
    if (offset && filePath && onGoToDefinition) {
      onGoToDefinition(filePath, parseInt(offset, 10));
    }
  }, [filePath, onGoToDefinition]);

  const content = fileData?.content || '';
  const language = filePath ? detectLanguage(filePath) : 'plaintext';

  // Build merged display lines including removed lines from diff
  const displayLines = useMemo(() => {
    const lines: DisplayLine[] = [];

    // Build a map of additions (line numbers that were added)
    const additionsMap: Record<number, { isStaged: boolean }> = {};

    // Build a map of removed lines to insert before each new line number
    const removedLinesMap: Map<number, Array<{ oldLineNumber: number; content: string; isStaged: boolean }>> = new Map();

    // Process diff hunks to extract removed lines and additions
    const processHunks = (hunks: LineDiff[][], isStaged: boolean) => {
      for (const hunk of hunks) {
        let pendingRemovals: Array<{ oldLineNumber: number; content: string; isStaged: boolean }> = [];

        const flushRemovals = (beforeLine: number) => {
          if (pendingRemovals.length > 0) {
            const existing = removedLinesMap.get(beforeLine) || [];
            removedLinesMap.set(beforeLine, [...existing, ...pendingRemovals]);
            pendingRemovals = [];
          }
        };

        for (const line of hunk) {
          if (line.type === 'remove') {
            pendingRemovals.push({
              oldLineNumber: line.lineNumber,
              content: line.content,
              isStaged,
            });
          } else if (line.type === 'add') {
            // Additions - record the line number
            if (!additionsMap[line.lineNumber]) {
              additionsMap[line.lineNumber] = { isStaged };
            }
            // Flush any pending removals before this added line
            flushRemovals(line.lineNumber);
          } else if (line.type === 'context') {
            // Context line - flush any pending removals before this line
            flushRemovals(line.lineNumber);
          }
        }

        // Handle removals at end of hunk (end of file)
        if (pendingRemovals.length > 0) {
          const lastLineNum = highlightedLines.length + 1;
          const existing = removedLinesMap.get(lastLineNum) || [];
          removedLinesMap.set(lastLineNum, [...existing, ...pendingRemovals]);
        }
      }
    };

    if (diffData?.staged?.hunks) {
      processHunks(diffData.staged.hunks, true);
    }
    if (diffData?.unstaged?.hunks) {
      processHunks(diffData.unstaged.hunks, false);
    }

    // Build the display lines array
    for (let i = 0; i < highlightedLines.length; i++) {
      const lineNum = i + 1;

      // First, insert any removed lines that should appear before this line
      const removedBefore = removedLinesMap.get(lineNum);
      if (removedBefore) {
        for (const removed of removedBefore) {
          lines.push({
            type: 'removed',
            content: removed.content,
            highlightKey: `${removed.isStaged ? 's' : 'u'}-${removed.oldLineNumber}`,
            newLineNumber: null,
            oldLineNumber: removed.oldLineNumber,
            diffType: 'remove',
            isStaged: removed.isStaged,
          });
        }
      }

      // Then add the current line
      const addition = additionsMap[lineNum];
      lines.push({
        type: 'current',
        content: '', // Not used for current lines anymore — tokens are in highlightedLines
        newLineNumber: lineNum,
        oldLineNumber: null,
        diffType: addition ? 'add' : null,
        isStaged: addition?.isStaged || false,
      });
    }

    // Handle removed lines at the very end of the file
    const afterLastLine = highlightedLines.length + 1;
    const removedAtEnd = removedLinesMap.get(afterLastLine);
    if (removedAtEnd) {
      for (const removed of removedAtEnd) {
        lines.push({
          type: 'removed',
          content: removed.content,
          highlightKey: `${removed.isStaged ? 's' : 'u'}-${removed.oldLineNumber}`,
          newLineNumber: null,
          oldLineNumber: removed.oldLineNumber,
          diffType: 'remove',
          isStaged: removed.isStaged,
        });
      }
    }

    return lines;
  }, [highlightedLines, diffData]);

  useEffect(() => {
    if (!content) {
      setHighlightedLines([]);
      return;
    }

    setIsHighlighting(true);

    getHighlighter()
      .then((highlighter) => {
        const highlighted = highlighter.codeToTokens(content, {
          lang: language,
          theme: 'github-dark',
          includeExplanation: 'scopeName',
        });

        // Convert tokens to structured TokenInfo arrays
        const tokenLines = highlighted.tokens.map((lineTokens) => {
          return lineTokens.map((token) => {
            // Collect all scope names from the token's explanation
            const scopes: string[] = [];
            if (token.explanation) {
              for (const exp of token.explanation) {
                for (const scope of exp.scopes) {
                  scopes.push(scope.scopeName);
                }
              }
            }

            const trimmed = token.content.trim();
            const clickable = trimmed.length > 1 &&
              /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed) &&
              isIdentifierToken(scopes);

            return {
              content: token.content,
              color: token.color || 'inherit',
              isClickable: clickable,
              offset: token.offset,
            };
          });
        });

        setHighlightedLines(tokenLines);
      })
      .catch((err) => {
        console.error('Highlighting failed:', err);
        // Fallback to plain text
        setHighlightedLines(
          content.split('\n').map((line, i, arr) => {
            const lineOffset = arr.slice(0, i).reduce((sum, l) => sum + l.length + 1, 0);
            return [{ content: line, color: 'inherit', isClickable: false, offset: lineOffset }];
          })
        );
      })
      .finally(() => {
        setIsHighlighting(false);
      });
  }, [content, language]);

  // Highlight removed lines from diff (keep as HTML since they don't need clickability)
  useEffect(() => {
    if (!diffData) {
      setHighlightedRemovedLines(new Map());
      return;
    }

    // Collect all removed lines from hunks
    const removedLines: Array<{ key: string; content: string }> = [];

    const extractRemovedLines = (hunks: LineDiff[][], isStaged: boolean) => {
      for (const hunk of hunks) {
        for (const line of hunk) {
          if (line.type === 'remove') {
            const key = `${isStaged ? 's' : 'u'}-${line.lineNumber}`;
            removedLines.push({ key, content: line.content });
          }
        }
      }
    };

    if (diffData.staged?.hunks) {
      extractRemovedLines(diffData.staged.hunks, true);
    }
    if (diffData.unstaged?.hunks) {
      extractRemovedLines(diffData.unstaged.hunks, false);
    }

    if (removedLines.length === 0) {
      setHighlightedRemovedLines(new Map());
      return;
    }

    getHighlighter()
      .then((highlighter) => {
        const highlighted = new Map<string, string>();

        for (const { key, content: lineContent } of removedLines) {
          const tokens = highlighter.codeToTokens(lineContent, {
            lang: language,
            theme: 'github-dark',
          });

          const html = tokens.tokens[0]
            ?.map(
              (token) =>
                `<span style="color: ${token.color || 'inherit'}">${escapeHtml(token.content)}</span>`
            )
            .join('') || escapeHtml(lineContent);

          highlighted.set(key, html);
        }

        setHighlightedRemovedLines(highlighted);
      })
      .catch((err) => {
        console.error('Highlighting removed lines failed:', err);
      });
  }, [diffData, language]);

  if (!filePath) {
    return (
      <div className={styles.empty}>
        <span>Select a file to view</span>
      </div>
    );
  }

  if (isLoading || isHighlighting) {
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

  return (
    <div ref={containerRef} className={`${styles.container} ${cmdHeld ? styles.cmdHeld : ''}`}>
      <div className={styles.codeWrapper}>
        <table className={styles.codeTable}>
          <tbody>
            {displayLines.map((line, index) => {
              const diffInfo = line.diffType
                ? { type: line.diffType, isStaged: line.isStaged }
                : undefined;

              const isRemoved = line.type === 'removed';
              const lineNum = isRemoved ? null : line.newLineNumber;
              const isSelected = !isRemoved && lineNum !== null && activeSelection &&
                lineNum >= activeSelection.startLine && lineNum <= activeSelection.endLine;
              const hasComment = !isRemoved && lineNum !== null && commentedLines?.has(lineNum);
              const isTarget = lineNum !== null && lineNum === targetLine;

              return (
                <tr
                  key={index}
                  data-line={lineNum}
                  className={`${styles.line} ${line.diffType ? styles[`diff-${line.diffType}`] : ''} ${isRemoved ? styles.removedLine : ''} ${isSelected ? styles.selectedLine : ''} ${hasComment ? styles.commentedLine : ''} ${isTarget ? styles.targetLine : ''}`}
                >
                  <td className={styles.gutter}>
                    <DiffGutter diff={diffInfo} />
                  </td>
                  <td
                    className={`${styles.lineNumber} ${isRemoved ? styles.oldLineNumber : ''}`}
                    onMouseDown={lineNum ? (e) => handleLineMouseDown(lineNum, e) : undefined}
                    onMouseEnter={lineNum ? () => handleLineMouseEnter(lineNum) : undefined}
                    style={lineNum ? { cursor: 'pointer' } : undefined}
                  >
                    {isRemoved ? line.oldLineNumber : line.newLineNumber}
                  </td>
                  <td className={styles.lineContent}>
                    {isRemoved ? (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: (line.highlightKey && highlightedRemovedLines.get(line.highlightKey)) || escapeHtml(line.content),
                        }}
                      />
                    ) : (
                      renderTokenLine(lineNum !== null ? highlightedLines[lineNum - 1] : undefined, handleTokenClick)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderTokenLine(
  tokens: TokenInfo[] | undefined,
  onTokenClick: (e: React.MouseEvent<HTMLSpanElement>) => void,
): React.ReactNode {
  if (!tokens || tokens.length === 0) return <>&nbsp;</>;

  return tokens.map((token, i) => {
    if (token.isClickable) {
      return (
        <span
          key={i}
          style={{ color: token.color }}
          className={styles.clickableToken}
          data-offset={token.offset}
          onClick={onTokenClick}
        >
          {token.content}
        </span>
      );
    }
    return (
      <span key={i} style={{ color: token.color }}>
        {token.content}
      </span>
    );
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
