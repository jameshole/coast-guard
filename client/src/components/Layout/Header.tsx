import { GitBranch, Folder } from 'lucide-react';
import { useProjectInfo } from '../../hooks/useFileTree';
import { useGitBranch, useGitCheck } from '../../hooks/useGitStatus';
import styles from './Header.module.css';

interface HeaderProps {
  currentFile: string | null;
}

export function Header({ currentFile }: HeaderProps) {
  const { data: projectInfo } = useProjectInfo();
  const { data: gitCheck } = useGitCheck();
  const { data: gitBranch } = useGitBranch();

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
        </div>
      )}

      <div className={styles.spacer} />

      {gitCheck?.isGitRepo && gitBranch?.branch && (
        <div className={styles.gitInfo}>
          <GitBranch size={14} className={styles.icon} />
          <span className={styles.branchName}>{gitBranch.branch}</span>
        </div>
      )}
    </header>
  );
}
