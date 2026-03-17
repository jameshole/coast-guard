import { ReactNode } from 'react';
import { Header } from './Header';
import styles from './Layout.module.css';

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  currentFile: string | null;
  ignoreWhitespace: boolean;
  onToggleWhitespace: () => void;
}

export function Layout({ sidebar, main, currentFile, ignoreWhitespace, onToggleWhitespace }: LayoutProps) {
  return (
    <div className={styles.layout}>
      <Header currentFile={currentFile} ignoreWhitespace={ignoreWhitespace} onToggleWhitespace={onToggleWhitespace} />
      <div className={styles.content}>
        <div className={styles.sidebar}>{sidebar}</div>
        <div className={styles.main}>{main}</div>
      </div>
    </div>
  );
}
