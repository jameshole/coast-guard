import { useState, useEffect, ReactNode } from 'react';
import { MessageSquare, PanelLeftClose } from 'lucide-react';
import styles from '../Sidebar/Sidebar.module.css';

interface LiteSidebarProps {
  commentCount: number;
  commentPanel: ReactNode;
  pendingSelection: { startLine: number; endLine: number } | null;
}

const CONTENT_WIDTH = 260;

/** Comments-only sidebar for the scout single-file app. */
export function LiteSidebar({ commentCount, commentPanel, pendingSelection }: LiteSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Selecting lines in the viewer opens the panel so the comment form is visible
  useEffect(() => {
    if (pendingSelection) setCollapsed(false);
  }, [pendingSelection]);

  return (
    <div className={styles.sidebar}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${!collapsed ? styles.active : ''}`}
          onClick={() => setCollapsed((c) => !c)}
          title="Comments"
        >
          <MessageSquare size={18} />
          {commentCount > 0 && <span className={styles.commentBadge}>{commentCount}</span>}
        </button>
        <div className={styles.tabSpacer} />
        <button
          className={styles.tab}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <PanelLeftClose size={18} className={collapsed ? styles.collapseIconFlipped : ''} />
        </button>
      </div>
      <div
        className={`${styles.contentWrapper} ${collapsed ? styles.contentCollapsed : ''}`}
        style={!collapsed ? { width: CONTENT_WIDTH + 4 } : undefined}
      >
        <div className={styles.content} style={{ width: CONTENT_WIDTH }}>
          {!collapsed && commentPanel}
        </div>
      </div>
    </div>
  );
}
