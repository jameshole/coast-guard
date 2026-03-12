import { useState } from 'react';
import { Copy, Trash2, MessageSquarePlus, X } from 'lucide-react';
import styles from './CommentPanel.module.css';

export interface Comment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
}

interface CommentPanelProps {
  comments: Comment[];
  currentFile: string | null;
  onAddComment: (comment: Omit<Comment, 'id'>) => void;
  onDeleteComment: (id: string) => void;
  onClearCurrentFile: () => void;
  onClearAll: () => void;
  /** When set, shows the "add comment" form for this line range */
  pendingSelection: { startLine: number; endLine: number } | null;
  onCancelSelection: () => void;
}

function formatCommentsForCopy(comments: Comment[]): string {
  return comments
    .map((c) => `${c.filePath} lines:${c.startLine}-${c.endLine}\n${c.body}`)
    .join('\n---\n');
}

export function CommentPanel({
  comments,
  currentFile,
  onAddComment,
  onDeleteComment,
  onClearCurrentFile,
  onClearAll,
  pendingSelection,
  onCancelSelection,
}: CommentPanelProps) {
  const [newCommentBody, setNewCommentBody] = useState('');

  const currentFileComments = comments.filter((c) => c.filePath === currentFile);
  const hasCurrentFileComments = currentFileComments.length > 0;
  const hasAnyComments = comments.length > 0;

  const handleCopyCurrentFile = () => {
    if (!hasCurrentFileComments) return;
    navigator.clipboard.writeText(formatCommentsForCopy(currentFileComments));
  };

  const handleCopyAll = () => {
    if (!hasAnyComments) return;
    navigator.clipboard.writeText(formatCommentsForCopy(comments));
  };

  const handleSubmitComment = () => {
    if (!pendingSelection || !currentFile || !newCommentBody.trim()) return;
    onAddComment({
      filePath: currentFile,
      startLine: pendingSelection.startLine,
      endLine: pendingSelection.endLine,
      body: newCommentBody.trim(),
    });
    setNewCommentBody('');
    onCancelSelection();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmitComment();
    }
    if (e.key === 'Escape') {
      onCancelSelection();
      setNewCommentBody('');
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.title}>Comments</span>
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={handleCopyCurrentFile}
            disabled={!hasCurrentFileComments}
            title="Copy current file comments"
          >
            <Copy size={14} />
            <span>File</span>
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleCopyAll}
            disabled={!hasAnyComments}
            title="Copy all comments"
          >
            <Copy size={14} />
            <span>All</span>
          </button>
          <button
            className={styles.actionBtn}
            onClick={onClearCurrentFile}
            disabled={!hasCurrentFileComments}
            title="Clear current file comments"
          >
            <Trash2 size={14} />
            <span>File</span>
          </button>
          <button
            className={styles.actionBtn}
            onClick={onClearAll}
            disabled={!hasAnyComments}
            title="Clear all comments"
          >
            <Trash2 size={14} />
            <span>All</span>
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {pendingSelection && currentFile && (
          <div className={styles.addForm}>
            <div className={styles.formHeader}>
              <MessageSquarePlus size={14} />
              <span>
                Lines {pendingSelection.startLine}-{pendingSelection.endLine}
              </span>
              <button className={styles.cancelBtn} onClick={() => { onCancelSelection(); setNewCommentBody(''); }}>
                <X size={14} />
              </button>
            </div>
            <textarea
              className={styles.textarea}
              value={newCommentBody}
              onChange={(e) => setNewCommentBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add your comment... (Cmd+Enter to submit)"
              autoFocus
              rows={3}
            />
            <button
              className={styles.submitBtn}
              onClick={handleSubmitComment}
              disabled={!newCommentBody.trim()}
            >
              Add Comment
            </button>
          </div>
        )}

        {currentFileComments.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {currentFile?.split('/').pop()}
            </div>
            {currentFileComments.map((comment) => (
              <div key={comment.id} className={styles.comment}>
                <div className={styles.commentHeader}>
                  <span className={styles.lineRange}>
                    Lines {comment.startLine}-{comment.endLine}
                  </span>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => onDeleteComment(comment.id)}
                    title="Delete comment"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className={styles.commentBody}>{comment.body}</div>
              </div>
            ))}
          </div>
        )}

        {comments.filter((c) => c.filePath !== currentFile).length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Other files</div>
            {Array.from(
              new Set(
                comments
                  .filter((c) => c.filePath !== currentFile)
                  .map((c) => c.filePath)
              )
            ).map((filePath) => (
              <div key={filePath} className={styles.fileGroup}>
                <div className={styles.fileName}>{filePath}</div>
                {comments
                  .filter((c) => c.filePath === filePath)
                  .map((comment) => (
                    <div key={comment.id} className={styles.comment}>
                      <div className={styles.commentHeader}>
                        <span className={styles.lineRange}>
                          Lines {comment.startLine}-{comment.endLine}
                        </span>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => onDeleteComment(comment.id)}
                          title="Delete comment"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className={styles.commentBody}>{comment.body}</div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}

        {!hasAnyComments && !pendingSelection && (
          <div className={styles.emptyState}>
            <MessageSquarePlus size={24} />
            <p>Select lines in the code viewer to add comments</p>
          </div>
        )}
      </div>
    </div>
  );
}
