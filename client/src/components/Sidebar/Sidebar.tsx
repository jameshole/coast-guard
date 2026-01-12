import { useState } from 'react';
import { FolderTree, GitBranch } from 'lucide-react';
import { FileTree } from '../FileTree';
import { GitChangedFiles } from '../GitChangedFiles';
import { useChangedFiles } from '../../hooks/useGitStatus';
import styles from './Sidebar.module.css';

type TabType = 'explorer' | 'source-control';

interface SidebarProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}

export function Sidebar({ onFileSelect, selectedFile }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('explorer');
  const { data: changedFiles } = useChangedFiles();
  const changedCount = changedFiles ? Object.keys(changedFiles).length : 0;

  return (
    <div className={styles.sidebar}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'explorer' ? styles.active : ''}`}
          onClick={() => setActiveTab('explorer')}
          title="Explorer"
        >
          <FolderTree size={18} />
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'source-control' ? styles.active : ''}`}
          onClick={() => setActiveTab('source-control')}
          title="Source Control"
        >
          <GitBranch size={18} />
          {changedCount > 0 && <span className={styles.badge}>{changedCount}</span>}
        </button>
      </div>
      <div className={styles.content}>
        {activeTab === 'explorer' && (
          <FileTree onFileSelect={onFileSelect} selectedFile={selectedFile} />
        )}
        {activeTab === 'source-control' && (
          <GitChangedFiles onFileSelect={onFileSelect} selectedFile={selectedFile} />
        )}
      </div>
    </div>
  );
}
