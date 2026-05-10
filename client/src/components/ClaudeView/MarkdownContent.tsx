import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ClaudeView.module.css';

interface MarkdownContentProps {
  text: string;
}

const components = {
  a: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  ),
};

export function MarkdownContent({ text }: MarkdownContentProps) {
  return (
    <div className={styles.md}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>
    </div>
  );
}
