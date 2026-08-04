import { ReactNode } from 'react';
import { Header } from './Header';
import styles from './Layout.module.css';

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  currentFile: string | null;
  ignoreWhitespace: boolean;
  onToggleWhitespace: () => void;
  showBlame: boolean;
  onToggleBlame: () => void;
  markdownCodeView: boolean;
  onToggleMarkdownCodeView: () => void;
  mainView: 'editor' | 'claude' | 'opencode';
  onSetMainView: (view: 'editor' | 'claude' | 'opencode') => void;
  onToggleMainView: () => void;
}

export function Layout({ sidebar, main, currentFile, ignoreWhitespace, onToggleWhitespace, showBlame, onToggleBlame, markdownCodeView, onToggleMarkdownCodeView, mainView, onSetMainView, onToggleMainView }: LayoutProps) {
  return (
    <div className={styles.layout}>
      <Header
        currentFile={currentFile}
        ignoreWhitespace={ignoreWhitespace}
        onToggleWhitespace={onToggleWhitespace}
        showBlame={showBlame}
        onToggleBlame={onToggleBlame}
        markdownCodeView={markdownCodeView}
        onToggleMarkdownCodeView={onToggleMarkdownCodeView}
        mainView={mainView}
        onSetMainView={onSetMainView}
        onToggleMainView={onToggleMainView}
      />
      <div className={styles.content}>
        <div className={styles.sidebar}>{sidebar}</div>
        <div className={styles.main}>{main}</div>
      </div>
    </div>
  );
}
