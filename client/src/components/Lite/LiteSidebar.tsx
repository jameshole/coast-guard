import { useState, useEffect, ReactNode } from 'react';
import { MessageSquare, PanelLeftClose } from 'lucide-react';
import { useSidebarResize } from '../Sidebar/useSidebarResize';
import styles from '../Sidebar/Sidebar.module.css';

interface LiteSidebarProps {
  commentCount: number;
  commentPanel: ReactNode;
  pendingSelection: { startLine: number; endLine: number } | null;
}

/** Comments-only sidebar for the scout single-file app. */
export function LiteSidebar({ commentCount, commentPanel, pendingSelection }: LiteSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { contentWidth, resizing, handleResizeStart } = useSidebarResize();

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
        className={`${styles.contentWrapper} ${collapsed ? styles.contentCollapsed : ''} ${resizing ? styles.noTransition : ''}`}
        style={!collapsed ? { width: contentWidth + 4 } : undefined}
      >
        <div className={styles.content} style={{ width: contentWidth }}>
          {!collapsed && commentPanel}
        </div>
        <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      </div>
    </div>
  );
}
