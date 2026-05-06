import { useState, useEffect, useCallback, useRef } from 'react';
import { GitBranch, Folder, ChevronUp, ChevronDown, Space, ExternalLink, Eye, Code, FileText, MessageSquare } from 'lucide-react';
import { useProjectInfo } from '../../hooks/useFileTree';
import { useGitBranch, useGitCheck } from '../../hooks/useGitStatus';
import styles from './Header.module.css';

function isMarkdownFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'mdx';
}

interface HeaderProps {
  currentFile: string | null;
  ignoreWhitespace: boolean;
  onToggleWhitespace: () => void;
  markdownCodeView: boolean;
  onToggleMarkdownCodeView: () => void;
  mainView: 'editor' | 'claude';
  onToggleMainView: () => void;
}

export function Header({ currentFile, ignoreWhitespace, onToggleWhitespace, markdownCodeView, onToggleMarkdownCodeView, mainView, onToggleMainView }: HeaderProps) {
  const { data: projectInfo } = useProjectInfo();
  const { data: gitCheck } = useGitCheck();
  const { data: gitBranch } = useGitBranch();
  const [diffCount, setDiffCount] = useState(0);
  const [currentDiffIndex, setCurrentDiffIndex] = useState(-1);
  const lastFileRef = useRef<string | null>(null);

  // Find diff chunks in the DOM (groups of consecutive diff lines)
  const getDiffChunks = useCallback(() => {
    const allDiffs = document.querySelectorAll('[class*="diff-add"], [class*="diff-remove"]');
    if (allDiffs.length === 0) return [];

    // Group consecutive diff lines into chunks
    const chunks: Element[] = [];
    let lastElement: Element | null = null;

    allDiffs.forEach((element) => {
      // Check if this element is adjacent to the last one
      const isAdjacent =
        lastElement && lastElement.nextElementSibling === element;

      if (!isAdjacent) {
        // Start of a new chunk - store the first element
        chunks.push(element);
      }

      lastElement = element;
    });

    return chunks;
  }, []);

  // Check for diffs when file changes or periodically
  useEffect(() => {
    if (currentFile !== lastFileRef.current) {
      lastFileRef.current = currentFile;
      setCurrentDiffIndex(-1);
    }

    const checkDiffs = () => {
      const chunks = getDiffChunks();
      setDiffCount(chunks.length);
    };

    checkDiffs();
    // Check again after a short delay for content to load
    const timeout = setTimeout(checkDiffs, 500);

    return () => clearTimeout(timeout);
  }, [currentFile, getDiffChunks]);

  const navigateDiff = useCallback(
    (direction: 'up' | 'down') => {
      const chunks = getDiffChunks();
      if (chunks.length === 0) return;

      let newIndex: number;
      if (direction === 'down') {
        newIndex = currentDiffIndex < chunks.length - 1 ? currentDiffIndex + 1 : 0;
      } else {
        newIndex = currentDiffIndex > 0 ? currentDiffIndex - 1 : chunks.length - 1;
      }

      setCurrentDiffIndex(newIndex);
      chunks[newIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [currentDiffIndex, getDiffChunks]
  );

  return (
    <header className={styles.header}>
      <div className={styles.projectInfo}>
        <Folder size={16} className={styles.icon} />
        <span className={styles.projectName}>{projectInfo?.name || 'Loading...'}</span>
      </div>

      {currentFile && (
        <div className={styles.breadcrumb}>
          <span className={styles.separator}>/</span>
          <span className={styles.currentFile}>{currentFile}</span>
          <button
            className={styles.openInEditor}
            onClick={() => window.open(`cursor://file/${projectInfo?.path}/${currentFile}`, '_blank')}
            title="Open in Cursor"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      )}

      <div className={styles.spacer} />

      {currentFile && isMarkdownFile(currentFile) && (
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewToggleButton} ${!markdownCodeView ? styles.viewToggleButtonActive : ''}`}
            onClick={() => markdownCodeView && onToggleMarkdownCodeView()}
            title="Rendered view"
          >
            <Eye size={14} />
            <span>Rendered</span>
          </button>
          <button
            className={`${styles.viewToggleButton} ${markdownCodeView ? styles.viewToggleButtonActive : ''}`}
            onClick={() => !markdownCodeView && onToggleMarkdownCodeView()}
            title="Code view"
          >
            <Code size={14} />
            <span>Code</span>
          </button>
        </div>
      )}

      {diffCount > 0 && (
        <div className={styles.diffNav}>
          <button
            className={styles.diffNavButton}
            onClick={() => navigateDiff('up')}
            title="Previous change"
          >
            <ChevronUp size={16} />
          </button>
          <span className={styles.diffCount}>
            {currentDiffIndex >= 0 ? `${currentDiffIndex + 1}/` : ''}
            {diffCount}
          </span>
          <button
            className={styles.diffNavButton}
            onClick={() => navigateDiff('down')}
            title="Next change"
          >
            <ChevronDown size={16} />
          </button>
          <button
            className={`${styles.diffNavButton} ${ignoreWhitespace ? styles.diffNavButtonActive : ''}`}
            onClick={onToggleWhitespace}
            title={ignoreWhitespace ? 'Showing diff without whitespace changes' : 'Showing all diff changes'}
          >
            <Space size={16} />
          </button>
        </div>
      )}

      <div className={styles.viewToggle}>
        <button
          className={`${styles.viewToggleButton} ${mainView === 'editor' ? styles.viewToggleButtonActive : ''}`}
          onClick={() => mainView !== 'editor' && onToggleMainView()}
          title="Editor (Cmd/Ctrl+J to toggle)"
        >
          <FileText size={14} />
          <span>Editor</span>
        </button>
        <button
          className={`${styles.viewToggleButton} ${mainView === 'claude' ? styles.viewToggleButtonActive : ''}`}
          onClick={() => mainView !== 'claude' && onToggleMainView()}
          title="Claude (Cmd/Ctrl+J to toggle)"
        >
          <MessageSquare size={14} />
          <span>Claude</span>
        </button>
      </div>

      {gitCheck?.isGitRepo && gitBranch?.branch && (
        <div className={styles.gitInfo}>
          <GitBranch size={14} className={styles.icon} />
          <span className={styles.branchName}>{gitBranch.branch}</span>
        </div>
      )}
    </header>
  );
}
