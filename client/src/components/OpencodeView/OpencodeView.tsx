import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Send, Square, RotateCcw } from 'lucide-react';
import { MarkdownContent } from '../ClaudeView/MarkdownContent';
import { useOpencode } from './OpencodeContext';
import type { OpenCodeEvent } from './types';
import styles from './OpencodeView.module.css';

type RenderItem =
  | { kind: 'user'; key: string; content: string }
  | { kind: 'assistant'; key: string; text: string; isStreaming: boolean }
  | { kind: 'pending'; key: string }
  | { kind: 'error'; key: string; message: string };

function extractTextFromEvents(events: OpenCodeEvent[]): string {
  const texts: string[] = [];
  for (const ev of events) {
    if (ev.type === 'text' && ev.part?.text) {
      texts.push(ev.part.text);
    }
  }
  return texts.join('');
}

export function OpencodeView() {
  const {
    thread,
    loadError,
    chatError,
    streamingEvents,
    streamingUser,
    isStreaming,
    draft,
    setDraft,
    send,
    stop,
    reset,
  } = useOpencode();

  const input = draft;
  const setInput = setDraft;
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);

  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];
    if (!thread) return items;

    for (const node of thread.nodes) {
      if (node.role === 'user') {
        items.push({ kind: 'user', key: `u-${node.id}`, content: node.content });
      } else {
        const text = extractTextFromEvents(node.events);
        items.push({
          kind: 'assistant',
          key: `a-${node.id}`,
          text,
          isStreaming: false,
        });
      }
    }

    if (streamingUser) {
      items.push({ kind: 'user', key: `stream-u-${streamingUser.id}`, content: streamingUser.content });
    }

    if (streamingEvents !== null) {
      const text = extractTextFromEvents(streamingEvents);
      if (text) {
        items.push({ kind: 'assistant', key: 'stream-text', text, isStreaming: true });
      } else {
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

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (composerRef.current) composerRef.current.style.height = 'auto';
    stickToBottomRef.current = true;
    await send(text);
  }, [input, send, setInput]);

  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (loadError) {
    return (
      <div className={styles.errorState}>
        <div>Failed to load opencode thread</div>
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
          onClick={() => void reset()}
          disabled={isStreaming}
          title="New conversation"
        >
          <RotateCcw size={12} />
          <span>new</span>
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.chatCol}>
          <div className={styles.scroll} ref={scrollRef} onScroll={handleScroll}>
            {renderItems.length === 0 && !isStreaming ? (
              <div className={styles.empty}>
                <img src="/images/opencode.png" alt="" className={styles.emptyIcon} style={{ width: 178 }} />
                <div className={styles.emptyTitle}>empty conversation</div>
                <div className={styles.emptyHint}>send a message to start</div>
                <div className={styles.setupNote}>
                  <strong>opencode must be installed first</strong>
                </div>
                <div className={styles.setupDetail}>
                  then run <code>opencode auth login</code> in your terminal.
                  It walks you through selecting a provider (e.g. OpenAI, Anthropic, Google, OpenCode Zen or OpenCode Go) and entering your API key.
                </div>
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
                placeholder={isStreaming ? 'opencode is responding — type now, send when done' : 'send a message — enter to send, shift+enter for newline'}
              />
              {isStreaming ? (
                <button className={styles.composerSend} onClick={stop}>
                  <Square size={12} />
                  <span>stop</span>
                </button>
              ) : (
                <button className={styles.composerSend} onClick={() => void handleSend()} disabled={!input.trim()}>
                  <Send size={12} />
                  <span>send</span>
                </button>
              )}
            </div>
            <div className={styles.bottomInfo}>
              <span className={styles.headerMeta}>cwd: {thread.cwd}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: RenderItem;
  isLast: boolean;
}

function ItemRow({ item, isLast }: ItemRowProps) {
  const dotRole = item.kind === 'error' ? 'error' : undefined;
  const gutter = (
    <div className={styles.bubbleGutter}>
      <span className={styles.timelineDot} data-role={dotRole} />
      {!isLast && <span className={styles.timelineLine} />}
    </div>
  );

  if (item.kind === 'user') {
    return (
      <div className={styles.bubbleRow}>
        {gutter}
        <div className={styles.bubble}>
          <div className={styles.bubbleLabel} data-role="user">USER</div>
          <div className={styles.bubbleBody}>{item.content}</div>
        </div>
        <div className={styles.bubbleAux} />
      </div>
    );
  }

  if (item.kind === 'assistant') {
    return (
      <div className={styles.bubbleRow}>
        {gutter}
        <div className={styles.bubble}>
          <div className={styles.bubbleLabel} data-role="assistant">
            OPENCODE
            {item.isStreaming && (
              <span className={styles.typingDots}>
                <span /><span /><span />
              </span>
            )}
          </div>
          <div className={styles.bubbleBody}>
            <MarkdownContent text={item.text} />
          </div>
        </div>
        <div className={styles.bubbleAux} />
      </div>
    );
  }

  if (item.kind === 'pending') {
    return (
      <div className={styles.bubbleRow}>
        {gutter}
        <div className={styles.bubble}>
          <div className={styles.bubbleLabel} data-role="assistant">
            OPENCODE
            <span className={styles.typingDots}>
              <span /><span /><span />
            </span>
          </div>
          <div className={styles.bubbleBody}>
            <span className={styles.streamingCaret}>▍</span>
          </div>
        </div>
        <div className={styles.bubbleAux} />
      </div>
    );
  }

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
      <div className={styles.bubbleAux} />
    </div>
  );
}
