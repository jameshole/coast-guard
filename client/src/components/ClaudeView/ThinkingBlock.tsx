import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './ClaudeView.module.css';

interface ThinkingBlockProps {
  text: string;
}

export function ThinkingBlock({ text }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false);
  const preview = text.replace(/\s+/g, ' ').slice(0, 80);
  return (
    <div className={styles.toolCall} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className={styles.toolCallHeader}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight size={11} className={styles.toolCallChev} />
        <span className={styles.toolCallName}>thinking</span>
        <span className={styles.toolCallSummary}>{preview}</span>
      </button>
      {open && (
        <div className={styles.toolCallBody}>
          <pre className={styles.toolCallPre}>{text}</pre>
        </div>
      )}
    </div>
  );
}
