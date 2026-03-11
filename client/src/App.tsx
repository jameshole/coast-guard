import { useState, useCallback, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { CodeViewer } from './components/CodeViewer';
import { MarkdownViewer } from './components/MarkdownViewer';
import { CommandPalette } from './components/CommandPalette';
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

function AppContent() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
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

    return <CodeViewer filePath={selectedFile} ignoreWhitespace={ignoreWhitespace} />;
  };

  return (
    <>
      <Layout
        sidebar={
          <Sidebar onFileSelect={handleFileSelect} selectedFile={selectedFile} />
        }
        main={renderMainContent()}
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
