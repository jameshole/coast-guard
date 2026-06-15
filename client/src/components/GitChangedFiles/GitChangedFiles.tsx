import { useEffect, useMemo, useRef } from 'react';
import { Circle } from 'lucide-react';
import { useChangedFiles, useDiffStats } from '../../hooks/useGitStatus';
import { useDiffBase } from '../../hooks/useDiffBase';
import { getFileIcon, getFileIconColor } from '../FileTree/fileIcons';
import { isTypingTarget } from '../../utils/keyboard';
import type { GitFileStatus } from '../../types';
import { DiffBasePicker } from './DiffBasePicker';
import styles from './GitChangedFiles.module.css';

interface GitChangedFilesProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
  /** Gates the j/k shortcuts so they don't fire while the Claude view is up. */
  shortcutsEnabled: boolean;
}

interface ChangedFile {
  path: string;
  name: string;
  status: GitFileStatus;
}

const statusOrder: Record<GitFileStatus, number> = {
  staged: 0,
  modified: 1,
  untracked: 2,
};

const statusColor: Record<GitFileStatus, string> = {
  staged: 'var(--git-staged)',
  modified: 'var(--git-modified)',
  untracked: 'var(--git-untracked)',
};

export function GitChangedFiles({ onFileSelect, selectedFile, shortcutsEnabled }: GitChangedFilesProps) {
  const { baseRef } = useDiffBase();
  const { data: changedFiles, isLoading } = useChangedFiles(baseRef);
  const { data: diffStats } = useDiffStats(baseRef);
  const listRef = useRef<HTMLDivElement>(null);

  const files = useMemo((): ChangedFile[] => {
    if (!changedFiles) return [];

    return Object.entries(changedFiles)
      .map(([path, status]) => ({
        path,
        name: path.split('/').pop() || path,
        status,
      }))
      .sort((a, b) => {
        // Sort by status first, then by path
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        return a.path.localeCompare(b.path);
      });
  }, [changedFiles]);

  // z/x walk the changed-file list (x = next, z = previous, wrapping at the
  // ends). Only mounted while the source-control tab is open, so the shortcut
  // is scoped to that context.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'x' && e.key !== 'z') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (!shortcutsEnabled || isTypingTarget(e.target) || files.length === 0) return;
      e.preventDefault();
      const index = files.findIndex((f) => f.path === selectedFile);
      const next =
        e.key === 'x'
          ? index < files.length - 1 ? index + 1 : 0
          : index > 0 ? index - 1 : files.length - 1;
      onFileSelect(files[next].path);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, selectedFile, onFileSelect, shortcutsEnabled]);

  // Keep the selected file visible as j/k move it past the list's scroll edges.
  useEffect(() => {
    if (!selectedFile) return;
    listRef.current
      ?.querySelector(`[data-path="${CSS.escape(selectedFile)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedFile]);

  const hasStats =
    diffStats && (diffStats.filesChanged > 0 || diffStats.insertions > 0 || diffStats.deletions > 0);

  return (
    <div className={styles.container}>
      <DiffBasePicker />
      {hasStats && (
        <div
          className={styles.stats}
          title={`${diffStats.filesChanged} file${diffStats.filesChanged === 1 ? '' : 's'} changed, ${diffStats.insertions} insertion${diffStats.insertions === 1 ? '' : 's'}(+), ${diffStats.deletions} deletion${diffStats.deletions === 1 ? '' : 's'}(-)`}
        >
          <span className={styles.statsFiles}>
            {diffStats.filesChanged} file{diffStats.filesChanged === 1 ? '' : 's'}
          </span>
          <span className={styles.statsAdditions}>+{diffStats.insertions}</span>
          <span className={styles.statsDeletions}>−{diffStats.deletions}</span>
        </div>
      )}
      <div className={styles.fileList} ref={listRef}>
        {isLoading ? (
          <div className={styles.loading}>
            <span>Loading...</span>
          </div>
        ) : files.length === 0 ? (
          <div className={styles.empty}>
            <span>No changes</span>
          </div>
        ) : (
          files.map((file) => {
            const Icon = getFileIcon(file.name, false, false);
            const iconColor = getFileIconColor(file.name, false);
            const isSelected = selectedFile === file.path;

            return (
              <div
                key={file.path}
                className={`${styles.file} ${isSelected ? styles.selected : ''}`}
                data-path={file.path}
                onClick={() => onFileSelect(file.path)}
                title={file.path}
              >
                <Icon size={16} style={{ color: iconColor }} className={styles.icon} />
                <span className={styles.name}>{file.name}</span>
                <span className={styles.path}>{file.path.split('/').slice(0, -1).join('/')}</span>
                <Circle
                  size={8}
                  fill={statusColor[file.status]}
                  stroke="none"
                  className={styles.statusDot}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
