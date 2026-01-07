import { CollapsiblePanel } from '../CollapsiblePanel';
import { FileTree } from '../FileTree';
import { GitChangedFiles } from '../GitChangedFiles';
import { useChangedFiles } from '../../hooks/useGitStatus';
import styles from './Sidebar.module.css';

interface SidebarProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}

export function Sidebar({ onFileSelect, selectedFile }: SidebarProps) {
  const { data: changedFiles } = useChangedFiles();
  const changedCount = changedFiles ? Object.keys(changedFiles).length : 0;

  return (
    <div className={styles.sidebar}>
      <CollapsiblePanel title="Source Control" defaultOpen={true} badge={changedCount}>
        <GitChangedFiles onFileSelect={onFileSelect} selectedFile={selectedFile} />
      </CollapsiblePanel>
      <CollapsiblePanel title="Explorer" defaultOpen={true}>
        <FileTree onFileSelect={onFileSelect} selectedFile={selectedFile} />
      </CollapsiblePanel>
    </div>
  );
}
