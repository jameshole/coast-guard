import { useState, useMemo, useRef, useEffect } from 'react';
import { Copy, Trash2, Send, MessageSquarePlus, X, ArrowUpDown } from 'lucide-react';
import { useClaudeOptional } from '../ClaudeView';
import styles from './CommentPanel.module.css';

export interface Comment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
}

type SortOrder = 'newest' | 'oldest' | 'top' | 'bottom';

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'newest', label: 'Newest to oldest' },
  { value: 'oldest', label: 'Oldest to newest' },
  { value: 'top', label: 'Top of file to bottom' },
  { value: 'bottom', label: 'Bottom of file to top' },
];

const SORT_ORDER_KEY = 'coast-guard:comment-sort-order';

function loadSortOrder(): SortOrder {
  try {
    const stored = localStorage.getItem(SORT_ORDER_KEY);
    if (SORT_OPTIONS.some((o) => o.value === stored)) return stored as SortOrder;
  } catch {
    // Storage unavailable; fall through to the default
  }
  return 'newest';
}

interface CommentPanelProps {
  comments: Comment[];
  currentFile: string | null;
  onAddComment: (comment: Omit<Comment, 'id'>) => void;
  onUpdateComment: (id: string, body: string) => void;
  onDeleteComment: (id: string) => void;
  onClearAll: () => void;
  /** Scroll the viewer to a comment's lines, opening its file first if needed */
  onJumpToComment: (comment: Comment) => void;
  /** Bring the Claude chat view into focus (used by the Send action). Omitted in the lite app, which has no Claude chat. */
  onFocusClaude?: () => void;
  /** When set, shows the "add comment" form for this line range */
  pendingSelection: { startLine: number; endLine: number } | null;
  onCancelSelection: () => void;
}

function formatLineRange(startLine: number, endLine: number): string {
  return startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`;
}

function formatCommentsForCopy(comments: Comment[]): string {
  // Backticked location + body, separated by blank lines. The backticks make the
  // location render as a clickable file reference in the Claude chat; avoiding
  // `---` (a markdown thematic break) keeps the rendered output clean.
  return comments
    .map((c) => `\`${c.filePath}:${c.startLine}-${c.endLine}\`\n\n${c.body}`)
    .join('\n\n');
}

/**
 * Sorts comments for display. `comments` is in creation order, so the time
 * orders are that order or its reverse. Position orders use the first line
 * only, so overlapping/enclosing comments sort by where they start.
 */
function sortComments(comments: Comment[], order: SortOrder): Comment[] {
  switch (order) {
    case 'newest':
      return [...comments].reverse();
    case 'oldest':
      return comments;
    case 'top':
      return [...comments].sort((a, b) => a.startLine - b.startLine);
    case 'bottom':
      return [...comments].sort((a, b) => b.startLine - a.startLine);
  }
}

interface CommentCardProps {
  comment: Comment;
  onUpdate: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  onJump: (comment: Comment) => void;
}

function CommentCard({ comment, onUpdate, onDelete, onJump }: CommentCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus with the caret at the end rather than selecting nothing at the start
  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const startEditing = () => {
    setDraft(comment.body);
    setEditing(true);
  };

  const save = () => {
    const body = draft.trim();
    // An emptied comment keeps its old body; deleting is what the X is for
    if (body && body !== comment.body) onUpdate(comment.id, body);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    }
  };

  return (
    <div className={styles.comment}>
      <div className={styles.commentHeader}>
        <button
          className={styles.lineRange}
          onClick={() => onJump(comment)}
          title="Go to these lines"
        >
          {formatLineRange(comment.startLine, comment.endLine)}
        </button>
        <button
          className={styles.deleteBtn}
          onClick={() => onDelete(comment.id)}
          title="Delete comment"
        >
          <X size={12} />
        </button>
      </div>
      {editing ? (
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={save}
          rows={3}
        />
      ) : (
        <div className={styles.commentBody} onClick={startEditing} title="Click to edit">
          {comment.body}
        </div>
      )}
    </div>
  );
}

export function CommentPanel({
  comments,
  currentFile,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onClearAll,
  onJumpToComment,
  onFocusClaude,
  pendingSelection,
  onCancelSelection,
}: CommentPanelProps) {
  const [newCommentBody, setNewCommentBody] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>(loadSortOrder);
  // Null in the lite scout app, where there is no Claude chat
  const claude = useClaudeOptional();
  const isStreaming = claude?.isStreaming ?? false;

  const sortedComments = useMemo(() => sortComments(comments, sortOrder), [comments, sortOrder]);
  const currentFileComments = sortedComments.filter((c) => c.filePath === currentFile);
  const otherFileComments = sortedComments.filter((c) => c.filePath !== currentFile);
  const hasAnyComments = comments.length > 0;

  // Other-file groups follow the sorted list for time orders (the file with the
  // newest/oldest comment comes first) and go alphabetically for position orders,
  // where comparing lines across files means nothing.
  const otherFilePaths = useMemo(() => {
    const paths = Array.from(new Set(otherFileComments.map((c) => c.filePath)));
    return sortOrder === 'top' || sortOrder === 'bottom' ? paths.sort() : paths;
  }, [otherFileComments, sortOrder]);

  const handleSortChange = (order: SortOrder) => {
    setSortOrder(order);
    try {
      localStorage.setItem(SORT_ORDER_KEY, order);
    } catch {
      // Storage unavailable; the choice just won't persist
    }
  };

  const handleCopy = () => {
    if (!hasAnyComments) return;
    navigator.clipboard.writeText(formatCommentsForCopy(comments));
  };

  const handleSend = () => {
    if (!claude || !hasAnyComments || isStreaming) return;
    onFocusClaude?.();
    void claude.send(formatCommentsForCopy(comments));
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

  const renderCard = (comment: Comment) => (
    <CommentCard
      key={comment.id}
      comment={comment}
      onUpdate={onUpdateComment}
      onDelete={onDeleteComment}
      onJump={onJumpToComment}
    />
  );

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
          {claude && (
            <button
              className={styles.actionBtn}
              onClick={handleSend}
              disabled={!hasAnyComments || isStreaming}
              title={isStreaming ? 'Claude is responding…' : 'Send all comments to Claude'}
            >
              <Send size={14} />
              <span>Send</span>
            </button>
          )}
        </div>
      </div>

      {hasAnyComments && (
        <div className={styles.sortBar}>
          <ArrowUpDown size={12} />
          <select
            className={styles.sortSelect}
            value={sortOrder}
            onChange={(e) => handleSortChange(e.target.value as SortOrder)}
            title="Comment order"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.content}>
        {pendingSelection && currentFile && (
          <div className={styles.addForm}>
            <div className={styles.formHeader}>
              <MessageSquarePlus size={14} />
              <span>{formatLineRange(pendingSelection.startLine, pendingSelection.endLine)}</span>
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
            {currentFileComments.map(renderCard)}
          </div>
        )}

        {otherFilePaths.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Other files</div>
            {otherFilePaths.map((filePath) => (
              <div key={filePath} className={styles.fileGroup}>
                <div className={styles.fileName}>{filePath}</div>
                {otherFileComments.filter((c) => c.filePath === filePath).map(renderCard)}
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
