import { useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { FolderTree, GitBranch, MessageSquare, PanelLeftClose, Play } from 'lucide-react';
import { FileTree } from '../FileTree';
import { GitChangedFiles } from '../GitChangedFiles';
import { useScripts } from '../ScriptsPanel';
import { useChangedFiles } from '../../hooks/useGitStatus';
import { useDiffBase } from '../../hooks/useDiffBase';
import styles from './Sidebar.module.css';

type TabType = 'explorer' | 'source-control' | 'comments' | 'scripts';

interface SidebarProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
  commentCount: number;
  commentPanel: ReactNode;
  scriptsPanel: ReactNode;
  pendingSelection: { startLine: number; endLine: number } | null;
}

export function Sidebar({ onFileSelect, selectedFile, commentCount, commentPanel, scriptsPanel, pendingSelection }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('explorer');
  const [collapsed, setCollapsed] = useState(false);
  const [contentWidth, setContentWidth] = useState(260);
  const [resizing, setResizing] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const dragging = useRef(false);
  const { baseRef } = useDiffBase();
  const { data: changedFiles } = useChangedFiles(baseRef);
  const changedCount = changedFiles ? Object.keys(changedFiles).length : 0;
  const { latestRun } = useScripts();
  const runningScripts = Object.values(latestRun).filter((r) => r && r.status === 'running').length;

  useEffect(() => {
    if (pendingSelection) {
      setActiveTab('comments');
      setCollapsed(false);
    }
  }, [pendingSelection]);

  const handleTabClick = useCallback((tab: TabType) => {
    if (activeTab === tab && !collapsed) {
      setCollapsed(true);
    } else {
      setActiveTab(tab);
      setCollapsed(false);
    }
  }, [activeTab, collapsed]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    setResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const tabs: Record<string, TabType> = { '1': 'explorer', '2': 'source-control', '3': 'comments', '4': 'scripts' };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setCtrlHeld(true);
      if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key in tabs) {
        e.preventDefault();
        const tab = tabs[e.key];
        setActiveTab(tab);
        setCollapsed(false);
      } else if (e.key === '0') {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') setCtrlHeld(false);
    };
    const handleBlur = () => setCtrlHeld(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // 44px is approximately the tab bar width
      const newWidth = Math.max(150, Math.min(600, e.clientX - 44));
      setContentWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        setResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className={styles.sidebar}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'explorer' && !collapsed ? styles.active : ''}`}
          onClick={() => handleTabClick('explorer')}
          title="Explorer"
        >
          <FolderTree size={18} />
          {ctrlHeld && <span className={styles.shortcutHint}>1</span>}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'source-control' && !collapsed ? styles.active : ''}`}
          onClick={() => handleTabClick('source-control')}
          title="Source Control"
        >
          <GitBranch size={18} />
          {ctrlHeld ? <span className={styles.shortcutHint}>2</span> : changedCount > 0 && <span className={styles.badge}>{changedCount}</span>}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'comments' && !collapsed ? styles.active : ''}`}
          onClick={() => handleTabClick('comments')}
          title="Comments"
        >
          <MessageSquare size={18} />
          {ctrlHeld ? <span className={styles.shortcutHint}>3</span> : commentCount > 0 && <span className={styles.commentBadge}>{commentCount}</span>}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'scripts' && !collapsed ? styles.active : ''}`}
          onClick={() => handleTabClick('scripts')}
          title="Scripts"
        >
          <Play size={18} />
          {ctrlHeld ? <span className={styles.shortcutHint}>4</span> : runningScripts > 0 && <span className={styles.runningBadge} />}
        </button>
        <div className={styles.tabSpacer} />
        <button
          className={styles.tab}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <PanelLeftClose size={18} className={collapsed ? styles.collapseIconFlipped : ''} />
          {ctrlHeld && <span className={styles.shortcutHint}>0</span>}
        </button>
      </div>
      <div
        className={`${styles.contentWrapper} ${collapsed ? styles.contentCollapsed : ''} ${resizing ? styles.noTransition : ''}`}
        style={!collapsed ? { width: contentWidth + 4 } : undefined}
      >
        <div className={styles.content} style={{ width: contentWidth }}>
          {!collapsed && activeTab === 'explorer' && (
            <FileTree onFileSelect={onFileSelect} selectedFile={selectedFile} />
          )}
          {!collapsed && activeTab === 'source-control' && (
            <GitChangedFiles onFileSelect={onFileSelect} selectedFile={selectedFile} />
          )}
          {!collapsed && activeTab === 'comments' && commentPanel}
          {!collapsed && activeTab === 'scripts' && scriptsPanel}
        </div>
        <div className={styles.resizeHandle} onMouseDown={handleMouseDown} />
      </div>
    </div>
  );
}
