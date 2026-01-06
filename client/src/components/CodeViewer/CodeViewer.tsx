import { useEffect, useState, useMemo } from 'react';
import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki';
import { useFileContent } from '../../hooks/useFileContent';
import { useFileDiff } from '../../hooks/useGitStatus';
import { DiffGutter } from './DiffGutter';
import styles from './CodeViewer.module.css';

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
  const [isHighlighting, setIsHighlighting] = useState(false);

  const content = fileData?.content || '';
  const language = filePath ? detectLanguage(filePath) : 'plaintext';

  // Calculate which lines have changes
  const lineDiffMap = useMemo(() => {
    const map: Record<number, { type: 'add' | 'remove'; isStaged: boolean }> = {};

    if (diffData?.staged) {
      for (const lineNum of diffData.staged.additions) {
        map[lineNum] = { type: 'add', isStaged: true };
      }
    }

    if (diffData?.unstaged) {
      for (const lineNum of diffData.unstaged.additions) {
        if (!map[lineNum]) {
          map[lineNum] = { type: 'add', isStaged: false };
        }
      }
    }

    return map;
  }, [diffData]);

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
            {highlightedLines.map((lineHtml, index) => {
              const lineNum = index + 1;
              const diff = lineDiffMap[lineNum];

              return (
                <tr
                  key={index}
                  className={`${styles.line} ${diff ? styles[`diff-${diff.type}`] : ''}`}
                >
                  <td className={styles.gutter}>
                    <DiffGutter diff={diff} />
                  </td>
                  <td className={styles.lineNumber}>{lineNum}</td>
                  <td
                    className={styles.lineContent}
                    dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
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
