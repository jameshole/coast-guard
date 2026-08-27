import { FileText, ExternalLink, Eye, Code, Compass } from 'lucide-react';
import { useProjectInfo } from '../../hooks/useFileTree';
import styles from '../Layout/Header.module.css';

function isMarkdownFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'mdx';
}

interface LiteHeaderProps {
  filePath: string;
  markdownCodeView: boolean;
  onToggleMarkdownCodeView: () => void;
}

/** Slim header for the scout single-file app: file name, path, and the markdown view toggle. */
export function LiteHeader({ filePath, markdownCodeView, onToggleMarkdownCodeView }: LiteHeaderProps) {
  const { data: projectInfo } = useProjectInfo();
  const fileName = filePath.split('/').pop() ?? filePath;
  const fullPath = projectInfo ? `${projectInfo.path}/${filePath}` : filePath;

  return (
    <header className={styles.header}>
      <div className={styles.projectInfo}>
        <FileText size={16} className={styles.icon} />
        <span className={styles.projectName}>{fileName}</span>
      </div>

      <div className={styles.breadcrumb}>
        <span className={styles.separator}>·</span>
        <span className={styles.currentFile}>{fullPath}</span>
        <button
          className={styles.openInEditor}
          onClick={() => window.open(`cursor://file/${fullPath}`, '_blank')}
          title="Open in Cursor"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      <div className={styles.spacer} />

      {isMarkdownFile(filePath) && (
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

      <div className={styles.gitInfo} title="Coast Guard scout — single-file reader">
        <Compass size={14} className={styles.icon} />
        <span className={styles.branchName}>scout</span>
      </div>
    </header>
  );
}
