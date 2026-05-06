import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, RotateCcw, MessageSquare } from 'lucide-react';
import { loadThread, resetThread, streamMessage } from './api';
import { buildTurnBubbles } from './buildBubbles';
import type { AssistantBubble, SystemNoteEvent } from './buildBubbles';
import { MarkdownContent } from './MarkdownContent';
import { ToolCall } from './ToolCall';
import { ThinkingBlock } from './ThinkingBlock';
import { SystemNote } from './SystemNote';
import type { ClaudeEvent, Thread } from './types';
import styles from './ClaudeView.module.css';

type RenderItem =
  | { kind: 'user'; key: string; content: string }
  | { kind: 'assistant'; key: string; bubble: AssistantBubble; isStreaming: boolean }
  | { kind: 'sys'; key: string; notes: SystemNoteEvent[] }
  | { kind: 'pending'; key: string }
  | { kind: 'error'; key: string; message: string };

interface StreamingUser {
  id: string;
  content: string;
}

export function ClaudeView() {
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streamingEvents, setStreamingEvents] = useState<ClaudeEvent[] | null>(null);
  const [streamingUser, setStreamingUser] = useState<StreamingUser | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stopRef = useRef<AbortController | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    loadThread()
      .then((t) => { if (!cancelled) setThread(t); })
      .catch((err) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const isStreaming = streamingEvents !== null;

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    if (!thread) return items;
    for (const node of thread.nodes) {
      if (node.role === 'user') {
        items.push({ kind: 'user', key: `u-${node.id}`, content: node.content });
      } else {
        const t = buildTurnBubbles(node.events as ClaudeEvent[]);
        if (t.systemNotes.length > 0) {
          items.push({ kind: 'sys', key: `sys-${node.id}`, notes: t.systemNotes });
        }
        for (const b of t.bubbles) {
          items.push({
            kind: 'assistant',
            key: `${node.id}-${b.msgId}`,
            bubble: b,
            isStreaming: false,
          });
        }
        if (t.bubbles.length === 0 && t.resultEvent?.is_error) {
          items.push({
            kind: 'error',
            key: `err-${node.id}`,
            message: t.resultEvent.result || t.resultEvent.error || 'error',
          });
        }
      }
    }
    if (streamingUser) {
      items.push({ kind: 'user', key: `stream-u-${streamingUser.id}`, content: streamingUser.content });
    }
    if (streamingEvents !== null) {
      const t = buildTurnBubbles(streamingEvents);
      if (t.systemNotes.length > 0) {
        items.push({ kind: 'sys', key: 'stream-sys', notes: t.systemNotes });
      }
      for (const b of t.bubbles) {
        items.push({
          kind: 'assistant',
          key: `stream-${b.msgId}`,
          bubble: b,
          isStreaming: true,
        });
      }
      if (t.bubbles.length === 0) {
        items.push({ kind: 'pending', key: 'stream-pending' });
      }
    }
    if (chatError) {
      items.push({ kind: 'error', key: 'chat-error', message: chatError });
    }
    return items;
  }, [thread, streamingEvents, streamingUser, chatError]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickToBottomRef.current = dist < 40;
  }, []);

  useLayoutEffect(() => {
    if (stickToBottomRef.current) scrollToBottom();
  }, [renderItems.length, streamingEvents, scrollToBottom]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !thread || isStreaming) return;
    setInput('');
    setChatError(null);
    stickToBottomRef.current = true;
    if (composerRef.current) composerRef.current.style.height = 'auto';

    const userNode: StreamingUser = { id: `u${Date.now()}`, content: text };
    setStreamingUser(userNode);
    setStreamingEvents([]);

    const ctrl = new AbortController();
    stopRef.current = ctrl;

    try {
      await streamMessage(text, ({ channel, data }) => {
        if (channel === 'claude') {
          setStreamingEvents((prev) => (prev ? [...prev, data as ClaudeEvent] : [data as ClaudeEvent]));
        } else if (channel === 'local') {
          const localData = data as { type?: string; message?: string };
          if (localData.type === 'turn_end') {
            void (async () => {
              try {
                const fresh = await loadThread();
                setThread(fresh);
              } finally {
                setStreamingEvents(null);
                setStreamingUser(null);
              }
            })();
          } else if (localData.type === 'error') {
            setChatError(localData.message || 'error');
          }
        }
      }, ctrl.signal);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err.name !== 'AbortError') setChatError(err.message || 'request failed');
      setStreamingEvents(null);
      setStreamingUser(null);
    } finally {
      stopRef.current = null;
    }
  }, [input, thread, isStreaming]);

  const stop = useCallback(() => {
    if (stopRef.current) {
      stopRef.current.abort();
      stopRef.current = null;
    }
  }, []);

  const handleNew = useCallback(async () => {
    if (isStreaming) return;
    if (thread && thread.nodes.length > 0) {
      const ok = window.confirm('Start a new conversation? This clears the current thread.');
      if (!ok) return;
    }
    try {
      const fresh = await resetThread();
      setThread(fresh);
      setChatError(null);
      stickToBottomRef.current = true;
    } catch (err) {
      setChatError((err as Error).message);
    }
  }, [isStreaming, thread]);

  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (loadError) {
    return (
      <div className={styles.errorState}>
        <div>Failed to load Claude thread</div>
        <div className={styles.errorMessage}>{loadError}</div>
      </div>
    );
  }

  if (!thread) {
    return <div className={styles.loadingState}>Loading…</div>;
  }

  const projectName = thread.cwd.split('/').filter(Boolean).pop() || 'project';

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.dot} data-busy={isStreaming ? 'true' : 'false'} />
          <span className={styles.headerLabel}>{isStreaming ? 'streaming…' : 'idle'}</span>
          <span className={styles.headerSep}>·</span>
          <span className={styles.headerMeta}>{thread.nodes.length} msgs</span>
        </div>
        <button
          className={styles.headerAction}
          onClick={handleNew}
          disabled={isStreaming}
          title="New conversation"
        >
          <RotateCcw size={12} />
          <span>new</span>
        </button>
      </div>

      <div className={styles.scroll} ref={scrollRef} onScroll={handleScroll}>
        {renderItems.length === 0 && !isStreaming ? (
          <div className={styles.empty}>
            <MessageSquare size={28} className={styles.emptyIcon} strokeWidth={1.4} />
            <div className={styles.emptyTitle}>empty conversation</div>
            <div className={styles.emptyHint}>send a message to start</div>
            <div className={styles.emptyMeta}>cwd: {thread.cwd}</div>
          </div>
        ) : (
        <div className={styles.inner}>
          {renderItems.map((it, idx) => {
            const isLast = idx === renderItems.length - 1;
            return <ItemRow key={it.key} item={it} isLast={isLast} />;
          })}
          <div className={styles.scrollPad} />
        </div>
        )}
      </div>

      <div className={styles.composer}>
        <div className={styles.composerRow}>
          <span className={styles.composerPrompt}>{projectName} ❯</span>
          <textarea
            ref={composerRef}
            className={styles.composerInput}
            rows={1}
            value={input}
            onChange={onInputChange}
            onKeyDown={onComposerKey}
            placeholder={isStreaming ? 'claude is responding…' : 'send a message — enter to send, shift+enter for newline'}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className={styles.composerSend} onClick={stop}>
              <Square size={12} />
              <span>stop</span>
            </button>
          ) : (
            <button className={styles.composerSend} onClick={() => void send()} disabled={!input.trim()}>
              <Send size={12} />
              <span>send</span>
            </button>
          )}
        </div>
        <div className={styles.composerHint}>cwd: {thread.cwd}</div>
      </div>
    </div>
  );
}

function ItemRow({ item, isLast }: { item: RenderItem; isLast: boolean }) {
  const dotRole = item.kind === 'error' ? 'error' : item.kind === 'sys' ? 'sys' : undefined;
  const gutter = (
    <div className={styles.bubbleGutter}>
      <span className={styles.timelineDot} data-role={dotRole} />
      {!isLast && <span className={styles.timelineLine} />}
    </div>
  );

  if (item.kind === 'sys') {
    return (
      <div className={styles.bubbleRow}>
        {gutter}
        <div className={styles.sysWrap}>
          {item.notes.map((n, i) => (
            <SystemNote key={i} event={n} />
          ))}
        </div>
      </div>
    );
  }

  if (item.kind === 'user') {
    return (
      <div className={styles.bubbleRow}>
        {gutter}
        <div className={styles.bubble}>
          <div className={styles.bubbleLabel} data-role="user">USER</div>
          <div className={styles.bubbleBody}>
            <MarkdownContent text={item.content} />
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'assistant') {
    const { bubble, isStreaming } = item;
    const hasText = !!bubble.text.trim();
    const hasTools = bubble.toolCalls.length > 0;
    const hasThinking = bubble.thinking.length > 0;

    return (
      <div className={styles.bubbleRow}>
        {gutter}
        <div className={styles.bubble}>
          <div className={styles.bubbleLabel} data-role="assistant">
            ASSISTANT
            {isStreaming && (
              <span className={styles.typingDots}>
                <span /><span /><span />
              </span>
            )}
          </div>
          <div className={styles.bubbleBody}>
            {hasThinking && (
              <div className={styles.toolList}>
                {bubble.thinking.map((t, i) => (
                  <ThinkingBlock key={`th-${i}`} text={t} />
                ))}
              </div>
            )}
            {hasText ? (
              <MarkdownContent text={bubble.text} />
            ) : !hasTools && isStreaming ? (
              <span className={styles.streamingCaret}>▍</span>
            ) : !hasTools ? (
              <div className={styles.workingNote}>working…</div>
            ) : null}
            {hasTools && (
              <div className={styles.toolList}>
                {bubble.toolCalls.map((c) => (
                  <ToolCall key={c.id} call={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'pending') {
    return (
      <div className={styles.bubbleRow}>
        {gutter}
        <div className={styles.bubble}>
          <div className={styles.bubbleLabel} data-role="assistant">
            ASSISTANT
            <span className={styles.typingDots}>
              <span /><span /><span />
            </span>
          </div>
          <div className={styles.bubbleBody}>
            <span className={styles.streamingCaret}>▍</span>
          </div>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className={styles.bubbleRow}>
      <div className={styles.bubbleGutter}>
        <span className={styles.timelineDot} data-role="error" />
        {!isLast && <span className={styles.timelineLine} />}
      </div>
      <div className={`${styles.bubble} ${styles.bubbleError}`}>
        <div className={styles.bubbleLabel} data-role="error">ERROR</div>
        <div className={styles.bubbleBody}>{item.message}</div>
      </div>
    </div>
  );
}
