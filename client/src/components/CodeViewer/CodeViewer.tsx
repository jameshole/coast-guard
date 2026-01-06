import { useEffect, useState, useMemo } from 'react';
import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki';
import { useFileContent } from '../../hooks/useFileContent';
import { useFileDiff } from '../../hooks/useGitStatus';
import { DiffGutter } from './DiffGutter';
import type { LineDiff } from '../../types';
import styles from './CodeViewer.module.css';

// A display line can be either from the current file or a removed line from diff
interface DisplayLine {
  type: 'current' | 'removed';
  content: string; // HTML content for current lines, plain text for removed
  highlightKey?: string; // Key for looking up highlighted content (for removed lines)
  newLineNumber: number | null; // Line number in current file (null for removed)
  oldLineNumber: number | null; // Line number in old file (for removed lines)
  diffType: 'add' | 'remove' | null;
  isStaged: boolean;
}

interface CodeViewerProps {
  filePath: string | null;
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

export function CodeViewer({ filePath }: CodeViewerProps) {
  const { data: fileData, isLoading, error } = useFileContent(filePath);
  const { data: diffData } = useFileDiff(filePath);
  const [highlightedLines, setHighlightedLines] = useState<string[]>([]);
  const [highlightedRemovedLines, setHighlightedRemovedLines] = useState<Map<string, string>>(new Map());
  const [isHighlighting, setIsHighlighting] = useState(false);

  const content = fileData?.content || '';
  const language = filePath ? detectLanguage(filePath) : 'plaintext';

  // Build merged display lines including removed lines from diff
  const displayLines = useMemo(() => {
    const lines: DisplayLine[] = [];

    // Build a map of additions (line numbers that were added)
    const additionsMap: Record<number, { isStaged: boolean }> = {};

    // Build a map of removed lines to insert before each new line number
    // Key: new line number where removed lines should appear before
    // Value: array of removed lines with their old line numbers
    const removedLinesMap: Map<number, Array<{ oldLineNumber: number; content: string; isStaged: boolean }>> = new Map();

    // Process diff hunks to extract removed lines and additions
    const processHunks = (hunks: LineDiff[][], isStaged: boolean) => {
      for (const hunk of hunks) {
        let pendingRemovals: Array<{ oldLineNumber: number; content: string; isStaged: boolean }> = [];
        let insertBeforeLine: number | null = null;

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
            // If we have pending removals, they should appear before this added line
            if (pendingRemovals.length > 0 && insertBeforeLine === null) {
              insertBeforeLine = line.lineNumber;
            }
          } else if (line.type === 'context') {
            // Context line - if we have pending removals, they appear before this line
            if (pendingRemovals.length > 0 && insertBeforeLine === null) {
              insertBeforeLine = line.lineNumber;
            }
          }
        }

        // Insert pending removals
        if (pendingRemovals.length > 0 && insertBeforeLine !== null) {
          const existing = removedLinesMap.get(insertBeforeLine) || [];
          removedLinesMap.set(insertBeforeLine, [...existing, ...pendingRemovals]);
        } else if (pendingRemovals.length > 0) {
          // Removals at end of file - insert after last line
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
        content: highlightedLines[i],
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
        // Use codeToTokens to get tokens for each line
        const highlighted = highlighter.codeToTokens(content, {
          lang: language,
          theme: 'github-dark',
        });

        // Convert tokens to HTML lines
        const htmlLines = highlighted.tokens.map((lineTokens) => {
          return lineTokens
            .map(
              (token) =>
                `<span style="color: ${token.color || 'inherit'}">${escapeHtml(token.content)}</span>`
            )
            .join('');
        });

        setHighlightedLines(htmlLines);
      })
      .catch((err) => {
        console.error('Highlighting failed:', err);
        // Fallback to plain text
        setHighlightedLines(content.split('\n').map(escapeHtml));
      })
      .finally(() => {
        setIsHighlighting(false);
      });
  }, [content, language]);

  // Highlight removed lines from diff
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
            // Use a unique key combining staged status and line number
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

    // Highlight all removed lines
    getHighlighter()
      .then((highlighter) => {
        const highlighted = new Map<string, string>();

        for (const { key, content: lineContent } of removedLines) {
          const tokens = highlighter.codeToTokens(lineContent, {
            lang: language,
            theme: 'github-dark',
          });

          // Convert first line of tokens to HTML (there should only be one line)
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
    <div className={styles.container}>
      <div className={styles.codeWrapper}>
        <table className={styles.codeTable}>
          <tbody>
            {displayLines.map((line, index) => {
              const diffInfo = line.diffType
                ? { type: line.diffType, isStaged: line.isStaged }
                : undefined;

              const isRemoved = line.type === 'removed';

              return (
                <tr
                  key={index}
                  className={`${styles.line} ${line.diffType ? styles[`diff-${line.diffType}`] : ''} ${isRemoved ? styles.removedLine : ''}`}
                >
                  <td className={styles.gutter}>
                    <DiffGutter diff={diffInfo} />
                  </td>
                  <td className={`${styles.lineNumber} ${isRemoved ? styles.oldLineNumber : ''}`}>
                    {isRemoved ? line.oldLineNumber : line.newLineNumber}
                  </td>
                  <td
                    className={styles.lineContent}
                    dangerouslySetInnerHTML={{
                      __html: isRemoved
                        ? (line.highlightKey && highlightedRemovedLines.get(line.highlightKey)) || escapeHtml(line.content)
                        : (line.content || '&nbsp;'),
                    }}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
