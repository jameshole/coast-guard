import { useState, useCallback, useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { CodeViewer } from './components/CodeViewer';
import { MarkdownViewer } from './components/MarkdownViewer';
import { CommandPalette } from './components/CommandPalette';
import { DefinitionPicker } from './components/DefinitionPicker';
import { CommentPanel } from './components/CommentPanel';
import type { Comment } from './components/CommentPanel';
import type { DefinitionResult } from './types';
import { api } from './services/api';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useProjectInfo } from './hooks/useFileTree';
import { DiffBaseProvider } from './hooks/useDiffBase';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function isMarkdownFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'mdx';
}

function fileToUrl(path: string | null): string {
  if (!path) return '/';
  return '/' + path.split('/').map(encodeURIComponent).join('/');
}

function urlToFile(pathname: string): string | null {
  const stripped = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!stripped) return null;
  try {
    return stripped.split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}

let commentIdCounter = 0;

function AppContent() {
  const [selectedFile, setSelectedFile] = useState<string | null>(() =>
    urlToFile(window.location.pathname),
  );
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [markdownCodeView, setMarkdownCodeView] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [pendingSelection, setPendingSelection] = useState<{ startLine: number; endLine: number } | null>(null);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [definitionResults, setDefinitionResults] = useState<DefinitionResult[]>([]);
  const [definitionSymbol, setDefinitionSymbol] = useState('');
  const [isDefinitionPickerOpen, setIsDefinitionPickerOpen] = useState(false);
  const [isDefinitionLoading, setIsDefinitionLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { data: projectInfo } = useProjectInfo();

  // Connect to file watcher for live updates
  const { connected } = useFileWatcher(selectedFile);

  // Update browser tab title based on project and selected file
  useEffect(() => {
    const repoName = projectInfo?.name;
    if (!repoName) return;

    if (selectedFile) {
      const fileName = selectedFile.split('/').pop();
      document.title = `${fileName} | ${repoName}`;
    } else {
      document.title = repoName;
    }
  }, [selectedFile, projectInfo?.name]);

  // Sync the selected file to the URL so browser history navigates between files
  useEffect(() => {
    const expected = fileToUrl(selectedFile);
    if (window.location.pathname !== expected) {
      window.history.pushState(null, '', expected);
    }
  }, [selectedFile]);

  // Respond to browser back/forward by loading whatever file the URL points at
  useEffect(() => {
    const handlePopState = () => {
      setSelectedFile(urlToFile(window.location.pathname));
      setPendingSelection(null);
      setTargetLine(null);
      setMarkdownCodeView(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFile(path);
    setPendingSelection(null);
    setTargetLine(null);
    setMarkdownCodeView(false);
  }, []);

  const handleGoToDefinition = useCallback(async (filePath: string, offset: number) => {
    setIsDefinitionLoading(true);
    try {
      const results = await api.getDefinition(filePath, offset);

      if (results.length === 0) {
        console.error('Go to definition: no results', { filePath, offset });
        setToast('Definition not found');
        return;
      }

      if (results.length === 1) {
        setSelectedFile(results[0].filePath);
        setTargetLine(results[0].line);
        setPendingSelection(null);
        setMarkdownCodeView(false);
      } else {
        setDefinitionSymbol('');
        setDefinitionResults(results);
        setIsDefinitionPickerOpen(true);
      }
    } catch (err) {
      console.error('Definition search failed:', err);
    } finally {
      setIsDefinitionLoading(false);
    }
  }, []);

  const handleDefinitionSelect = useCallback((result: DefinitionResult) => {
    setSelectedFile(result.filePath);
    setTargetLine(result.line);
    setPendingSelection(null);
    setMarkdownCodeView(false);
  }, []);

  // Global keyboard shortcut for cmd+k
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLineSelectionComplete = useCallback((startLine: number, endLine: number) => {
    setPendingSelection({ startLine, endLine });
  }, []);

  const handleAddComment = useCallback((comment: Omit<Comment, 'id'>) => {
    const id = `comment-${++commentIdCounter}`;
    setComments((prev) => [...prev, { ...comment, id }]);
  }, []);

  const handleDeleteComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleClearCurrentFile = useCallback(() => {
    setComments((prev) => prev.filter((c) => c.filePath !== selectedFile));
  }, [selectedFile]);

  const handleClearAll = useCallback(() => {
    setComments([]);
  }, []);

  const handleCancelSelection = useCallback(() => {
    setPendingSelection(null);
  }, []);

  // Set of line numbers that have comments in the current file
  const commentedLines = useMemo(() => {
    if (!selectedFile) return new Set<number>();
    const lines = new Set<number>();
    for (const c of comments) {
      if (c.filePath === selectedFile) {
        for (let i = c.startLine; i <= c.endLine; i++) {
          lines.add(i);
        }
      }
    }
    return lines;
  }, [comments, selectedFile]);

  // Render appropriate viewer based on file type
  const renderMainContent = () => {
    if (!selectedFile) {
      return <CodeViewer filePath={null} />;
    }

    if (isMarkdownFile(selectedFile) && !markdownCodeView) {
      return (
        <MarkdownViewer
          filePath={selectedFile}
          selectedLines={pendingSelection}
          onLineSelectionComplete={handleLineSelectionComplete}
          commentedLines={commentedLines}
        />
      );
    }

    return (
      <CodeViewer
        filePath={selectedFile}
        ignoreWhitespace={ignoreWhitespace}
        selectedLines={pendingSelection}
        onLineSelectionComplete={handleLineSelectionComplete}
        commentedLines={commentedLines}
        onGoToDefinition={handleGoToDefinition}
        targetLine={targetLine}
      />
    );
  };

  if (!connected) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        gap: '16px',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '3px solid var(--border-color)',
          borderTopColor: 'var(--text-secondary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: '18px', color: 'var(--text-primary)' }}>
          Server offline
        </div>
        <div style={{ fontSize: '13px' }}>
          Waiting for server to reconnect...
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout
        sidebar={
          <Sidebar
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
            commentCount={comments.length}
            pendingSelection={pendingSelection}
            commentPanel={
              <CommentPanel
                comments={comments}
                currentFile={selectedFile}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
                onClearCurrentFile={handleClearCurrentFile}
                onClearAll={handleClearAll}
                pendingSelection={pendingSelection}
                onCancelSelection={handleCancelSelection}
              />
            }
          />
        }
        main={renderMainContent()}
        currentFile={selectedFile}
        ignoreWhitespace={ignoreWhitespace}
        onToggleWhitespace={() => setIgnoreWhitespace(prev => !prev)}
        markdownCodeView={markdownCodeView}
        onToggleMarkdownCodeView={() => setMarkdownCodeView(prev => !prev)}
      />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectFile={handleFileSelect}
      />
      <DefinitionPicker
        results={definitionResults}
        symbol={definitionSymbol}
        isOpen={isDefinitionPickerOpen}
        onClose={() => setIsDefinitionPickerOpen(false)}
        onSelect={handleDefinitionSelect}
      />
      {isDefinitionLoading && <LoadingBar />}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const [exiting, setExiting] = useState(false);
  const duration = 3000;
  const animDuration = 150;

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), duration - animDuration);
    const doneTimer = setTimeout(onDone, duration);
    return () => { clearTimeout(exitTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      background: 'var(--bg-secondary)',
      border: '1px solid rgba(248, 81, 73, 0.4)',
      borderRadius: '6px',
      padding: '8px 16px',
      fontSize: '13px',
      color: '#f85149',
      zIndex: 9999,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      animation: `${exiting ? 'toastOut' : 'toastIn'} ${animDuration}ms ease-${exiting ? 'in' : 'out'} forwards`,
    }}>
      {message}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(8px); }
        }
      `}</style>
    </div>
  );
}

function LoadingBar() {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '2px',
      overflow: 'hidden',
      zIndex: 9999,
    }}>
      <div style={{
        height: '100%',
        width: '40%',
        background: 'var(--text-accent)',
        animation: 'loadingSlide 1s ease-in-out infinite',
      }} />
      <style>{`
        @keyframes loadingSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DiffBaseProvider>
        <AppContent />
      </DiffBaseProvider>
    </QueryClientProvider>
  );
}
