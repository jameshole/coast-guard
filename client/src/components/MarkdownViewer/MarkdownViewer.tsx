import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createHighlighter, type Highlighter } from 'shiki';
import { useFileContent } from '../../hooks/useFileContent';
import styles from './MarkdownViewer.module.css';

interface MarkdownViewerProps {
  filePath: string;
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
  className?: string;
  children?: React.ReactNode;
}

function CodeBlock({ className, children }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  // Extract language from className (e.g., "language-typescript")
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'plaintext';
  const code = String(children).replace(/\n$/, '');

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

export function MarkdownViewer({ filePath }: MarkdownViewerProps) {
  const { data: fileData, isLoading, error } = useFileContent(filePath);

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

  return (
    <div className={styles.container}>
      <article className={styles.article}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const isInline = !className;
              if (isInline) {
                return (
                  <code className={styles.inlineCode} {...props}>
                    {children}
                  </code>
                );
              }
              return <CodeBlock className={className}>{children}</CodeBlock>;
            },
            a({ href, children }) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
