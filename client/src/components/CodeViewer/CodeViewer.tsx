import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki';
import { FindBar, useFindBarState, createFindMatcher, FIND_MATCH_LIMIT } from '../FindBar';
import { useFileContent } from '../../hooks/useFileContent';
import { useFileDiff, useFileBlame } from '../../hooks/useGitStatus';
import { useDiffBase } from '../../hooks/useDiffBase';
import { DiffGutter } from './DiffGutter';
import { formatRelativeTime } from '../../utils/time';
import type { LineDiff, BlameHunk } from '../../types';
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
  showBlame?: boolean;
}

// A single find hit, addressed by 1-based line number and 0-based columns.
interface FindMatch {
  line: number;
  startCol: number;
  endCol: number;
}

// Per-line view of a match used while rendering token segments.
interface LineFindMatch {
  startCol: number;
  endCol: number;
  isActive: boolean;
}

// Blame column sizing (px). Width persists across sessions.
const BLAME_WIDTH_KEY = 'coastGuard.blameColumnWidth';
const BLAME_MIN_WIDTH = 80;
const BLAME_MAX_WIDTH = 400;
const BLAME_DEFAULT_WIDTH = 170;

// One blame cell per contiguous run of display rows sharing a hunk; rendered
// with rowSpan so the label can stick to the viewport top while scrolling.
interface BlameSpanInfo {
  hunk: BlameHunk | null;
  hunkIndex: number; // -1 when no blame info covers these rows
  span: number;
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

export function CodeViewer({ filePath, ignoreWhitespace = false, selectedLines, onLineSelectionComplete, commentedLines, onGoToDefinition, targetLine, showBlame = false }: CodeViewerProps) {
  const { data: fileData, isLoading, error } = useFileContent(filePath);
  const { baseRef } = useDiffBase();
  const { data: diffData } = useFileDiff(filePath, ignoreWhitespace, baseRef);
  // Blame is only fetched while the column is toggled on
  const { data: blameData } = useFileBlame(showBlame ? filePath : null);
  const [highlightedLines, setHighlightedLines] = useState<TokenInfo[][]>([]);
  const [highlightedRemovedLines, setHighlightedRemovedLines] = useState<Map<string, string>>(new Map());
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [cmdHeld, setCmdHeld] = useState(false);

  // Blame column: persisted width, hover tooltip, and in-flight drag state
  const [blameWidth, setBlameWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(BLAME_WIDTH_KEY));
    return stored >= BLAME_MIN_WIDTH && stored <= BLAME_MAX_WIDTH ? stored : BLAME_DEFAULT_WIDTH;
  });
  const [blameTooltip, setBlameTooltip] = useState<{ hunk: BlameHunk; left: number; top: number } | null>(null);
  const blameResize = useRef<{ startX: number; startWidth: number; lastWidth: number } | null>(null);

  // Line selection state for commenting
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // In-file find bar (Cmd/Ctrl+F). While the code view is mounted it replaces
  // the browser's page search so results only come from the file contents.
  const find = useFindBarState(!!filePath);

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

  const handleBlameHover = useCallback((hunk: BlameHunk, cell: HTMLTableCellElement) => {
    if (blameResize.current) return;
    // Anchor beside the label, which may be stuck to the viewport top mid-hunk
    const label = cell.querySelector('[data-blame-label]');
    const anchorTop = (label ?? cell).getBoundingClientRect().top;
    setBlameTooltip({
      hunk,
      left: cell.getBoundingClientRect().right + 8,
      top: Math.max(8, Math.min(anchorTop - 4, window.innerHeight - 110)),
    });
  }, []);

  const handleBlameLeave = useCallback(() => setBlameTooltip(null), []);

  const handleBlameResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    blameResize.current = { startX: e.clientX, startWidth: blameWidth, lastWidth: blameWidth };
    setBlameTooltip(null);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [blameWidth]);

  // Drag-resize the blame column. Width is applied straight to the CSS variable
  // during the drag (no re-render per mousemove) and committed to state +
  // localStorage on mouseup.
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = blameResize.current;
      if (!drag || !containerRef.current) return;
      const width = Math.max(
        BLAME_MIN_WIDTH,
        Math.min(BLAME_MAX_WIDTH, drag.startWidth + e.clientX - drag.startX),
      );
      drag.lastWidth = width;
      containerRef.current.style.setProperty('--blame-width', `${width}px`);
    };
    const handleMouseUp = () => {
      const drag = blameResize.current;
      if (!drag) return;
      blameResize.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setBlameWidth(drag.lastWidth);
      localStorage.setItem(BLAME_WIDTH_KEY, String(drag.lastWidth));
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const content = fileData?.content || '';
  const language = filePath ? detectLanguage(filePath) : 'plaintext';

  // All matches in file order. Searches the current file contents only —
  // removed diff lines are not part of the working tree, so they're skipped.
  const findMatches = useMemo(() => {
    if (!find.open || !content) return [];
    const matcher = createFindMatcher(find.query, find.caseSensitive, find.useRegex);
    if (!matcher) return [];
    const matches: FindMatch[] = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const [startCol, endCol] of matcher(lines[i])) {
        matches.push({ line: i + 1, startCol, endCol });
        if (matches.length >= FIND_MATCH_LIMIT) return matches;
      }
    }
    return matches;
  }, [find.open, find.query, find.caseSensitive, find.useRegex, content]);

  // Any change to the match set restarts navigation from the first match
  const { setActiveIndex: setFindActiveIndex } = find;
  useEffect(() => {
    setFindActiveIndex(0);
  }, [findMatches, setFindActiveIndex]);

  const findMatchesByLine = useMemo(() => {
    if (findMatches.length === 0) return null;
    const map = new Map<number, LineFindMatch[]>();
    findMatches.forEach((m, i) => {
      const arr = map.get(m.line) ?? [];
      arr.push({ startCol: m.startCol, endCol: m.endCol, isActive: i === find.activeIndex });
      map.set(m.line, arr);
    });
    return map;
  }, [findMatches, find.activeIndex]);

  // Keep the active match visible (block: center also handles horizontal
  // scroll via inline: nearest on the mark element itself)
  useEffect(() => {
    if (!find.open || findMatches.length === 0) return;
    const el = containerRef.current?.querySelector('[data-find-active]');
    el?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [find.open, findMatches, find.activeIndex]);

  const navigateFind = useCallback(
    (dir: 1 | -1) => {
      if (findMatches.length === 0) return;
      setFindActiveIndex((i) => (i + dir + findMatches.length) % findMatches.length);
    },
    [findMatches.length, setFindActiveIndex]
  );

  // Map each line number to its blame hunk; the hunk index drives the
  // alternating background tint that makes hunk boundaries readable.
  const blameByLine = useMemo(() => {
    if (!blameData || blameData.hunks.length === 0) return null;
    const map = new Map<number, { hunk: BlameHunk; hunkIndex: number }>();
    blameData.hunks.forEach((hunk, hunkIndex) => {
      for (let l = hunk.startLine; l < hunk.startLine + hunk.lineCount; l++) {
        map.set(l, { hunk, hunkIndex });
      }
    });
    return map;
  }, [blameData]);

  const blameVisible = showBlame && blameByLine !== null;

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

  // Group consecutive display rows by blame hunk. Each group renders a single
  // rowSpan cell (sparse array: entries only at group starts). Removed diff
  // lines aren't in the working tree, so they inherit the neighbouring hunk to
  // keep groups contiguous.
  const blameSpans = useMemo(() => {
    if (!blameByLine || displayLines.length === 0) return null;
    const INHERIT = -2;

    const rowHunk: number[] = displayLines.map((line) =>
      line.type === 'current' && line.newLineNumber !== null
        ? blameByLine.get(line.newLineNumber)?.hunkIndex ?? -1
        : INHERIT,
    );
    for (let i = 1; i < rowHunk.length; i++) {
      if (rowHunk[i] === INHERIT) rowHunk[i] = rowHunk[i - 1];
    }
    if (rowHunk[rowHunk.length - 1] === INHERIT) rowHunk[rowHunk.length - 1] = -1;
    for (let i = rowHunk.length - 2; i >= 0; i--) {
      if (rowHunk[i] === INHERIT) rowHunk[i] = rowHunk[i + 1];
    }

    const spans: Array<BlameSpanInfo | undefined> = new Array(displayLines.length);
    let i = 0;
    while (i < displayLines.length) {
      let j = i + 1;
      while (j < displayLines.length && rowHunk[j] === rowHunk[i]) j++;
      spans[i] = {
        hunkIndex: rowHunk[i],
        hunk: rowHunk[i] >= 0 ? blameData?.hunks[rowHunk[i]] ?? null : null,
        span: j - i,
      };
      i = j;
    }
    return spans;
  }, [displayLines, blameByLine, blameData]);

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
    <div className={styles.viewerRoot}>
      <FindBar
        find={find}
        matchCount={findMatches.length}
        capped={findMatches.length >= FIND_MATCH_LIMIT}
        onNavigate={navigateFind}
      />
    <div
      ref={containerRef}
      className={`${styles.container} ${cmdHeld ? styles.cmdHeld : ''}`}
      style={{ '--blame-width': `${blameWidth}px` } as React.CSSProperties}
    >
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
                  {blameVisible && blameSpans?.[index] && (
                    <BlameCell
                      info={blameSpans[index]!}
                      commitUrlBase={blameData?.commitUrlBase ?? null}
                      onHover={handleBlameHover}
                      onLeave={handleBlameLeave}
                      onResizeStart={handleBlameResizeStart}
                    />
                  )}
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
                      renderTokenLine(
                        lineNum !== null ? highlightedLines[lineNum - 1] : undefined,
                        handleTokenClick,
                        lineNum !== null ? findMatchesByLine?.get(lineNum) : undefined
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {blameTooltip && (
        <div
          className={styles.blameTooltip}
          style={{ left: blameTooltip.left, top: blameTooltip.top }}
        >
          {blameTooltip.hunk.isUncommitted ? (
            <div className={styles.blameTooltipAuthor}>Not committed yet</div>
          ) : (
            <>
              <div className={styles.blameTooltipAuthor}>
                {blameTooltip.hunk.author}
                <span className={styles.blameTooltipMuted}> · {formatRelativeAge(blameTooltip.hunk.authorTime)}</span>
              </div>
              <div className={styles.blameTooltipMuted}>{formatFullDate(blameTooltip.hunk.authorTime)}</div>
              <div className={styles.blameTooltipCommit}>
                <span className={styles.blameTooltipSha}>{blameTooltip.hunk.shortSha}</span>{' '}
                {blameTooltip.hunk.summary}
              </div>
            </>
          )}
        </div>
      )}
    </div>
    </div>
  );
}

function formatRelativeAge(unixSeconds: number): string {
  const rel = formatRelativeTime(unixSeconds);
  return rel === 'now' ? 'just now' : `${rel} ago`;
}

function formatFullDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} at ${time}`;
}

// Blame annotation cell: one per hunk (rowSpan covers the hunk's rows), with a
// sticky label that pins to the viewport top while its hunk scrolls past, and
// a link to the commit on GitHub when a remote is configured.
interface BlameCellProps {
  info: BlameSpanInfo;
  commitUrlBase: string | null;
  onHover: (hunk: BlameHunk, cell: HTMLTableCellElement) => void;
  onLeave: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

function BlameCell({ info, commitUrlBase, onHover, onLeave, onResizeStart }: BlameCellProps) {
  const { hunk, hunkIndex, span } = info;

  const cellClass = [
    styles.blameCell,
    hunkIndex >= 0 && hunkIndex % 2 === 1 ? styles.blameTinted : '',
    hunk?.isUncommitted ? styles.blameUncommitted : '',
  ].filter(Boolean).join(' ');

  const resizeHandle = <div className={styles.blameResizeHandle} onMouseDown={onResizeStart} />;

  if (!hunk) {
    return (
      <td className={cellClass} rowSpan={span}>
        {resizeHandle}
      </td>
    );
  }

  const label = hunk.isUncommitted ? (
    <span>Uncommitted</span>
  ) : (
    <>
      <span>{hunk.author}</span>
      <span className={styles.blameTime}> · {formatRelativeTime(hunk.authorTime)}</span>
    </>
  );

  return (
    <td
      className={cellClass}
      rowSpan={span}
      onMouseEnter={(e) => onHover(hunk, e.currentTarget)}
      onMouseLeave={onLeave}
    >
      <div className={styles.blameLabel} data-blame-label>
        {!hunk.isUncommitted && commitUrlBase ? (
          <a
            className={styles.blameLink}
            href={`${commitUrlBase}/${hunk.sha}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {label}
          </a>
        ) : (
          label
        )}
      </div>
      {resizeHandle}
    </td>
  );
}

// Split a token's text into plain and <mark>-wrapped segments wherever find
// matches overlap it. Columns are relative to the line; tokenStart maps them
// into this token's text.
function renderFindSegments(
  text: string,
  tokenStart: number,
  matches: LineFindMatch[],
): React.ReactNode {
  const tokenEnd = tokenStart + text.length;
  const parts: React.ReactNode[] = [];
  let pos = 0;

  for (const m of matches) {
    if (m.endCol <= tokenStart || m.startCol >= tokenEnd) continue;
    const start = Math.max(m.startCol - tokenStart, pos);
    const end = Math.min(m.endCol - tokenStart, text.length);
    if (end <= start) continue;
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(
      <mark
        key={`${start}-${end}`}
        className={`${styles.findMatch} ${m.isActive ? styles.findMatchActive : ''}`}
        data-find-active={m.isActive ? 'true' : undefined}
      >
        {text.slice(start, end)}
      </mark>
    );
    pos = end;
  }

  if (parts.length === 0) return text;
  if (pos < text.length) parts.push(text.slice(pos));
  return parts;
}

function renderTokenLine(
  tokens: TokenInfo[] | undefined,
  onTokenClick: (e: React.MouseEvent<HTMLSpanElement>) => void,
  findMatches?: LineFindMatch[],
): React.ReactNode {
  if (!tokens || tokens.length === 0) return <>&nbsp;</>;

  let col = 0;
  return tokens.map((token, i) => {
    const tokenStart = col;
    col += token.content.length;
    const content = findMatches?.length
      ? renderFindSegments(token.content, tokenStart, findMatches)
      : token.content;

    if (token.isClickable) {
      return (
        <span
          key={i}
          style={{ color: token.color }}
          className={styles.clickableToken}
          data-offset={token.offset}
          onClick={onTokenClick}
        >
          {content}
        </span>
      );
    }
    return (
      <span key={i} style={{ color: token.color }}>
        {content}
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
