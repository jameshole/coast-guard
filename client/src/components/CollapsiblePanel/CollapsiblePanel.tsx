import { useState, ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import styles from './CollapsiblePanel.module.css';

interface CollapsiblePanelProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: number;
}

export function CollapsiblePanel({ title, children, defaultOpen = true, badge }: CollapsiblePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={styles.panel}>
      <button
        className={styles.header}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className={styles.chevron}>
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className={styles.title}>{title}</span>
        {badge !== undefined && badge > 0 && (
          <span className={styles.badge}>{badge}</span>
        )}
      </button>
      {isOpen && <div className={styles.content}>{children}</div>}
    </div>
  );
}
