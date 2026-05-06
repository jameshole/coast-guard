import { Wrench, X } from 'lucide-react';
import type { AssistantBubble } from './buildBubbles';
import { ToolCall } from './ToolCall';
import styles from './ClaudeView.module.css';

interface ToolDrawerProps {
  bubble: AssistantBubble;
  onClose: () => void;
}

export function ToolDrawer({ bubble, onClose }: ToolDrawerProps) {
  const calls = bubble.toolCalls;
  return (
    <aside className={styles.toolDrawer}>
      <div className={styles.toolDrawerHeader}>
        <div className={styles.toolDrawerTitle}>
          <Wrench size={12} className={styles.toolDrawerGlyph} />
          <span>tool calls</span>
          <span className={styles.toolDrawerCount}>· {calls.length}</span>
        </div>
        <button
          type="button"
          className={styles.toolDrawerClose}
          onClick={onClose}
          title="Close"
        >
          <X size={12} />
        </button>
      </div>
      <div className={styles.toolDrawerList}>
        {calls.length === 0 ? (
          <div className={styles.toolDrawerEmpty}>no tool calls in this message.</div>
        ) : (
          calls.map((c) => <ToolCall key={c.id} call={c} />)
        )}
      </div>
    </aside>
  );
}
