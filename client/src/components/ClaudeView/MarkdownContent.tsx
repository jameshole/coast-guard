import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ClaudeView.module.css';

interface MarkdownContentProps {
  text: string;
}

export function MarkdownContent({ text }: MarkdownContentProps) {
  return (
    <div className={styles.md}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
