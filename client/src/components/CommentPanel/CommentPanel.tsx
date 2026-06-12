import { useState } from 'react';
import { Copy, Trash2, Send, MessageSquarePlus, X } from 'lucide-react';
import { useClaude } from '../ClaudeView';
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
  onClearAll: () => void;
  /** Bring the Claude chat view into focus (used by the Send action). */
  onFocusClaude: () => void;
  /** When set, shows the "add comment" form for this line range */
  pendingSelection: { startLine: number; endLine: number } | null;
  onCancelSelection: () => void;
}

function formatCommentsForCopy(comments: Comment[]): string {
  // Backticked location + body, separated by blank lines. The backticks make the
  // location render as a clickable file reference in the Claude chat; avoiding
  // `---` (a markdown thematic break) keeps the rendered output clean.
  return comments
    .map((c) => `\`${c.filePath}:${c.startLine}-${c.endLine}\`\n\n${c.body}`)
    .join('\n\n');
}

export function CommentPanel({
  comments,
  currentFile,
  onAddComment,
  onDeleteComment,
  onClearAll,
  onFocusClaude,
  pendingSelection,
  onCancelSelection,
}: CommentPanelProps) {
  const [newCommentBody, setNewCommentBody] = useState('');
  const { send, isStreaming } = useClaude();

  const currentFileComments = comments.filter((c) => c.filePath === currentFile);
  const hasAnyComments = comments.length > 0;

  const handleCopy = () => {
    if (!hasAnyComments) return;
    navigator.clipboard.writeText(formatCommentsForCopy(comments));
  };

  const handleSend = () => {
    if (!hasAnyComments || isStreaming) return;
    onFocusClaude();
    void send(formatCommentsForCopy(comments));
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
    if (e.key === 'Enter' && !e.shiftKey) {
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
            onClick={handleCopy}
            disabled={!hasAnyComments}
            title="Copy all comments"
          >
            <Copy size={14} />
            <span>Copy</span>
          </button>
          <button
            className={styles.actionBtn}
            onClick={onClearAll}
            disabled={!hasAnyComments}
            title="Delete all comments"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleSend}
            disabled={!hasAnyComments || isStreaming}
            title={isStreaming ? 'Claude is responding…' : 'Send all comments to Claude'}
          >
            <Send size={14} />
            <span>Send</span>
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
              placeholder="Add your comment... (Enter to submit, Shift+Enter for newline)"
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
