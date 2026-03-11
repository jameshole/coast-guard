import { ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
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
        <PanelGroup direction="horizontal">
          <Panel defaultSize={20} minSize={15} maxSize={40}>
            <div className={styles.sidebar}>{sidebar}</div>
          </Panel>
          <PanelResizeHandle className={styles.resizeHandle} />
          <Panel minSize={40}>
            <div className={styles.main}>{main}</div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
