import { useState, useCallback, useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { CodeViewer } from './components/CodeViewer';
import { MarkdownViewer } from './components/MarkdownViewer';
import { CommandPalette } from './components/CommandPalette';
import { CommentPanel } from './components/CommentPanel';
import type { Comment } from './components/CommentPanel';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useProjectInfo } from './hooks/useFileTree';

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

let commentIdCounter = 0;

function AppContent() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [pendingSelection, setPendingSelection] = useState<{ startLine: number; endLine: number } | null>(null);
  const { data: projectInfo } = useProjectInfo();

  // Connect to file watcher for live updates
  useFileWatcher(selectedFile);

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

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFile(path);
    setPendingSelection(null);
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

    if (isMarkdownFile(selectedFile)) {
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
      />
    );
  };

  return (
    <>
      <Layout
        sidebar={
          <Sidebar onFileSelect={handleFileSelect} selectedFile={selectedFile} />
        }
        main={renderMainContent()}
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
        currentFile={selectedFile}
        ignoreWhitespace={ignoreWhitespace}
        onToggleWhitespace={() => setIgnoreWhitespace(prev => !prev)}
      />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectFile={handleFileSelect}
      />
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
