import { useState, useCallback, useEffect, useMemo } from 'react';
import { CodeViewer } from '../CodeViewer';
import { MarkdownViewer } from '../MarkdownViewer';
import { CommentPanel } from '../CommentPanel';
import type { Comment } from '../CommentPanel';
import { ServerOffline } from '../ServerOffline';
import { LiteHeader } from './LiteHeader';
import { LiteSidebar } from './LiteSidebar';
import { useFileWatcher } from '../../hooks/useFileWatcher';
import layoutStyles from '../Layout/Layout.module.css';

function isMarkdownFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'mdx';
}

let commentIdCounter = 0;

interface LiteAppProps {
  /** Project-relative path of the single file this scout instance serves */
  initialFile: string;
}

/**
 * The scout single-file app: one file, syntax highlighted (rendered/code
 * toggle for markdown), with review comments — no git, tree, search, or chat.
 * The file is watched on the server, so external edits refresh the view live.
 */
export function LiteApp({ initialFile }: LiteAppProps) {
  const [markdownCodeView, setMarkdownCodeView] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [pendingSelection, setPendingSelection] = useState<{ startLine: number; endLine: number } | null>(null);

  // Connect to the file watcher so edits on disk refresh the content
  const { connected } = useFileWatcher(initialFile);

  useEffect(() => {
    const fileName = initialFile.split('/').pop() ?? initialFile;
    document.title = `${fileName} | scout`;
  }, [initialFile]);

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

  const handleClearAll = useCallback(() => {
    setComments([]);
  }, []);

  const handleCancelSelection = useCallback(() => {
    setPendingSelection(null);
  }, []);

  // Set of line numbers that have comments (used by the per-line code views)
  const commentedLines = useMemo(() => {
    const lines = new Set<number>();
    for (const c of comments) {
      for (let i = c.startLine; i <= c.endLine; i++) {
        lines.add(i);
      }
    }
    return lines;
  }, [comments]);

  // Comment ranges for markdown block highlighting
  const commentRanges = useMemo(
    () => comments.map((c) => ({ startLine: c.startLine, endLine: c.endLine })),
    [comments],
  );

  if (!connected) {
    return <ServerOffline />;
  }

  return (
    <div className={layoutStyles.layout}>
      <LiteHeader
        filePath={initialFile}
        markdownCodeView={markdownCodeView}
        onToggleMarkdownCodeView={() => setMarkdownCodeView((prev) => !prev)}
      />
      <div className={layoutStyles.content}>
        <div className={layoutStyles.sidebar}>
          <LiteSidebar
            commentCount={comments.length}
            pendingSelection={pendingSelection}
            commentPanel={
              <CommentPanel
                comments={comments}
                currentFile={initialFile}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
                onClearAll={handleClearAll}
                pendingSelection={pendingSelection}
                onCancelSelection={handleCancelSelection}
              />
            }
          />
        </div>
        <div className={layoutStyles.main}>
          {isMarkdownFile(initialFile) && !markdownCodeView ? (
            <MarkdownViewer
              filePath={initialFile}
              selectedLines={pendingSelection}
              onLineSelectionComplete={handleLineSelectionComplete}
              commentRanges={commentRanges}
            />
          ) : (
            <CodeViewer
              filePath={initialFile}
              disableGit
              selectedLines={pendingSelection}
              onLineSelectionComplete={handleLineSelectionComplete}
              commentedLines={commentedLines}
            />
          )}
        </div>
      </div>
    </div>
  );
}
