import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ToolCall as ToolCallType } from './buildBubbles';
import styles from './ClaudeView.module.css';

interface ToolCallProps {
  call: ToolCallType;
}

export function ToolCall({ call }: ToolCallProps) {
  const [open, setOpen] = useState(false);
  const summary = summarizeToolInput(call.name, call.input);
  const hasResult = call.result !== undefined;
  const status = hasResult ? (call.isError ? 'error' : 'done') : 'running';

  return (
    <div className={styles.toolCall} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className={styles.toolCallHeader}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight size={11} className={styles.toolCallChev} />
        <span className={styles.toolCallName}>{call.name}</span>
        {summary && <span className={styles.toolCallSummary}>{summary}</span>}
        <span className={styles.toolCallStatus} data-status={status}>
          {status}
        </span>
      </button>
      {open && (
        <div className={styles.toolCallBody}>
          <div className={styles.toolCallSection}>
            <div className={styles.toolCallSectionLabel}>input</div>
            <pre className={styles.toolCallPre}>{prettyJson(call.input)}</pre>
          </div>
          {hasResult && (
            <div className={styles.toolCallSection}>
              <div className={styles.toolCallSectionLabel}>{call.isError ? 'error' : 'result'}</div>
              <ToolResultContent content={call.result} isError={!!call.isError} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolResultContent({ content, isError }: { content: unknown; isError: boolean }) {
  const cls = isError ? `${styles.toolCallPre} ${styles.toolCallPreError}` : styles.toolCallPre;
  if (content == null) return null;
  if (typeof content === 'string') {
    return <pre className={cls}>{content}</pre>;
  }
  if (Array.isArray(content)) {
    return (
      <>
        {content.map((c, i) => {
          if (c && typeof c === 'object' && 'type' in c) {
            const item = c as { type: string; text?: string };
            if (item.type === 'text' && typeof item.text === 'string') {
              return <pre key={i} className={cls}>{item.text}</pre>;
            }
            if (item.type === 'image') {
              return <div key={i} className={cls}>[image]</div>;
            }
          }
          return <pre key={i} className={cls}>{prettyJson(c)}</pre>;
        })}
      </>
    );
  }
  return <pre className={cls}>{prettyJson(content)}</pre>;
}

function summarizeToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const i = input as Record<string, unknown>;
  if (name === 'Bash' && typeof i.command === 'string') return i.command;
  if (name === 'Read' && typeof i.file_path === 'string') return i.file_path;
  if (name === 'Edit' && typeof i.file_path === 'string') return i.file_path;
  if (name === 'Write' && typeof i.file_path === 'string') return i.file_path;
  if (name === 'Glob' && typeof i.pattern === 'string') return i.pattern;
  if (name === 'Grep' && typeof i.pattern === 'string') {
    return i.pattern + (typeof i.path === 'string' ? ` in ${i.path}` : '');
  }
  if (name === 'WebFetch' && typeof i.url === 'string') return i.url;
  if (name === 'WebSearch' && typeof i.query === 'string') return i.query;
  if (name === 'TodoWrite') {
    const todos = Array.isArray(i.todos) ? i.todos : [];
    return `${todos.length} todos`;
  }
  for (const k of Object.keys(i)) {
    const v = i[k];
    if (typeof v === 'string' && v.length < 200) return `${k}=${v}`;
  }
  return '';
}

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
