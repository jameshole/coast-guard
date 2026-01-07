import { useState, useCallback, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { FileTree } from './components/FileTree';
import { CodeViewer } from './components/CodeViewer';
import { MarkdownViewer } from './components/MarkdownViewer';
import { CommandPalette } from './components/CommandPalette';
import { useFileWatcher } from './hooks/useFileWatcher';

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

function AppContent() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Connect to file watcher for live updates
  useFileWatcher(selectedFile);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFile(path);
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

  // Render appropriate viewer based on file type
  const renderMainContent = () => {
    if (!selectedFile) {
      return <CodeViewer filePath={null} />;
    }

    if (isMarkdownFile(selectedFile)) {
      return <MarkdownViewer filePath={selectedFile} />;
    }

    return <CodeViewer filePath={selectedFile} />;
  };

  return (
    <>
      <Layout
        sidebar={
          <FileTree onFileSelect={handleFileSelect} selectedFile={selectedFile} />
        }
        main={renderMainContent()}
        currentFile={selectedFile}
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
