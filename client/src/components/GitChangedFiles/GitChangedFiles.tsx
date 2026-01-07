import { useMemo } from 'react';
import { Circle } from 'lucide-react';
import { useChangedFiles } from '../../hooks/useGitStatus';
import { getFileIcon, getFileIconColor } from '../FileTree/fileIcons';
import type { GitFileStatus } from '../../types';
import styles from './GitChangedFiles.module.css';

interface GitChangedFilesProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
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

export function GitChangedFiles({ onFileSelect, selectedFile }: GitChangedFilesProps) {
  const { data: changedFiles, isLoading } = useChangedFiles();

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

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <span>Loading...</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className={styles.empty}>
        <span>No changes</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {files.map((file) => {
        const Icon = getFileIcon(file.name, false, false);
        const iconColor = getFileIconColor(file.name, false);
        const isSelected = selectedFile === file.path;

        return (
          <div
            key={file.path}
            className={`${styles.file} ${isSelected ? styles.selected : ''}`}
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
      })}
    </div>
  );
}
