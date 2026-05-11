import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, RotateCcw, MessageSquare, Wrench } from 'lucide-react';
import { useClaude } from './ClaudeContext';
import { buildTurnBubbles } from './buildBubbles';
import type { AssistantBubble, SystemNoteEvent } from './buildBubbles';
import { MarkdownContent } from './MarkdownContent';
import { ToolDrawer } from './ToolDrawer';
import { SlashCommandPopover, filterCommands } from './SlashCommandPopover';
import type { ClaudeEvent } from './types';
import styles from './ClaudeView.module.css';

type RenderItem =
  | { kind: 'user'; key: string; content: string }
  | { kind: 'assistant'; key: string; bubble: AssistantBubble; isStreaming: boolean }
  | { kind: 'pending'; key: string }
  | { kind: 'error'; key: string; message: string };

interface SessionInfo {
  sessionId?: string;
  model?: string;
  toolsCount?: number;
  permissionMode?: string;
}

export function ClaudeView() {
  const {
    thread,
    loadError,
    chatError,
    streamingEvents,
    streamingUser,
    isStreaming,
    openToolMsgId,
    cachedSlashCommands,
    send,
    stop,
    reset,
    toggleTools,
    closeTools,
  } = useClaude();

  const [input, setInput] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissedFor, setSlashDismissedFor] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);

  // Walk the thread once: build render items (no sys notes inline) and accumulate
  // the latest init system note so we can show the session/model/tools chip in
  // the bottom bar instead of repeating it every turn.
  const { renderItems, sessionInfo, slashCommands } = useMemo(() => {
    const items: RenderItem[] = [];
    let latestInit: SystemNoteEvent | undefined;
    if (!thread) return { renderItems: items, sessionInfo: undefined, slashCommands: [] as string[] };

    const ingestNotes = (notes: SystemNoteEvent[]) => {
      for (const n of notes) {
        if (n.subtype === 'init') latestInit = n;
      }
    };

    for (const node of thread.nodes) {
      if (node.role === 'user') {
        items.push({ kind: 'user', key: `u-${node.id}`, content: node.content });
      } else {
        const t = buildTurnBubbles(node.events as ClaudeEvent[]);
        ingestNotes(t.systemNotes);
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
      ingestNotes(t.systemNotes);
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

    let info: SessionInfo | undefined;
    let commands: string[] = [];
    if (latestInit) {
      info = {
        sessionId: typeof latestInit.session_id === 'string' ? latestInit.session_id : undefined,
        model: typeof latestInit.model === 'string' ? latestInit.model : undefined,
        toolsCount: Array.isArray(latestInit.tools) ? latestInit.tools.length : undefined,
        permissionMode:
          typeof latestInit.permissionMode === 'string' ? latestInit.permissionMode : undefined,
      };
      const raw = (latestInit as { slash_commands?: unknown }).slash_commands;
      if (Array.isArray(raw)) {
        commands = raw.filter((c): c is string => typeof c === 'string');
      }
    }
    return { renderItems: items, sessionInfo: info, slashCommands: commands };
  }, [thread, streamingEvents, streamingUser, chatError]);

  // Find the bubble whose drawer is currently open. If the bubble disappears
  // (session reset, switch), close automatically.
  const drawerBubble = useMemo<AssistantBubble | null>(() => {
    if (!openToolMsgId) return null;
    for (const it of renderItems) {
      if (it.kind === 'assistant' && it.bubble.msgId === openToolMsgId) return it.bubble;
    }
    return null;
  }, [openToolMsgId, renderItems]);

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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (composerRef.current) composerRef.current.style.height = 'auto';
    stickToBottomRef.current = true;
    await send(text);
  }, [input, send]);

  // Slash-command popover triggers on the *token at the caret* — slash commands
  // can appear anywhere in a message, not just at the start.
  const slashContext = useMemo(
    () => getActiveSlashContext(input, cursor),
    [input, cursor],
  );
  const slashQuery = slashContext?.query ?? null;
  // Prefer the live list derived from the current thread's init events (always
  // accurate), but fall back to the per-cwd cache (warmed up on first launch)
  // so autocomplete works before the first turn of a brand-new session.
  const effectiveSlashCommands = slashCommands.length > 0 ? slashCommands : cachedSlashCommands;
  const slashFiltered = useMemo(() => {
    if (slashQuery === null) return [];
    return filterCommands(effectiveSlashCommands, slashQuery);
  }, [slashQuery, effectiveSlashCommands]);
  const slashPopoverOpen =
    slashContext !== null &&
    slashFiltered.length > 0 &&
    slashDismissedFor !== `${slashContext.start}:${slashContext.query}`;

  // Keep slashIndex in range as the filter narrows
  useEffect(() => {
    if (slashIndex >= slashFiltered.length) setSlashIndex(0);
  }, [slashFiltered.length, slashIndex]);

  const acceptSlash = (cmd: string) => {
    if (!slashContext) return;
    const { start, tokenEnd } = slashContext;
    const before = input.slice(0, start);
    const after = input.slice(tokenEnd);
    // Insert a trailing space only if there isn't already a space immediately after
    const needsSpace = after.length === 0 || !/^\s/.test(after);
    const insertion = `/${cmd}${needsSpace ? ' ' : ''}`;
    const next = before + insertion + after;
    setInput(next);
    setSlashDismissedFor(`${start}:${cmd}`);
    // restore textarea height + caret right after the inserted command
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
        el.focus();
        const caret = before.length + insertion.length;
        el.setSelectionRange(caret, caret);
        setCursor(caret);
      }
    });
  };

  const syncCursor = (el: HTMLTextAreaElement) => {
    setCursor(el.selectionStart ?? el.value.length);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Any input edit clears the manual dismiss, so the popover can reappear.
    setSlashDismissedFor(null);
    setSlashIndex(0);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    syncCursor(el);
  };

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashPopoverOpen) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = slashFiltered[slashIndex] ?? slashFiltered[0];
        if (cmd) acceptSlash(cmd);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashFiltered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashFiltered.length) % slashFiltered.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (slashContext) {
          setSlashDismissedFor(`${slashContext.start}:${slashContext.query}`);
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
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
                <MessageSquare size={28} className={styles.emptyIcon} strokeWidth={1.4} />
                <div className={styles.emptyTitle}>empty conversation</div>
                <div className={styles.emptyHint}>send a message to start</div>
                <div className={styles.emptyMeta}>cwd: {thread.cwd}</div>
              </div>
            ) : (
              <div className={styles.inner}>
                {renderItems.map((it, idx) => {
                  const isLast = idx === renderItems.length - 1;
                  return (
                    <ItemRow
                      key={it.key}
                      item={it}
                      isLast={isLast}
                      openToolMsgId={openToolMsgId}
                      onToggleTools={toggleTools}
                    />
                  );
                })}
                <div className={styles.scrollPad} />
              </div>
            )}
          </div>

          <div className={styles.composer}>
            {slashPopoverOpen && (
              <SlashCommandPopover
                query={slashQuery ?? ''}
                commands={effectiveSlashCommands}
                selectedIndex={slashIndex}
                onSelect={acceptSlash}
                onHoverIndex={setSlashIndex}
              />
            )}
            <div className={styles.composerRow}>
              <span className={styles.composerPrompt}>{projectName} ❯</span>
              <textarea
                ref={composerRef}
                className={styles.composerInput}
                rows={1}
                value={input}
                onChange={onInputChange}
                onKeyDown={onComposerKey}
                onKeyUp={(e) => syncCursor(e.currentTarget)}
                onClick={(e) => syncCursor(e.currentTarget)}
                onSelect={(e) => syncCursor(e.currentTarget)}
                placeholder={isStreaming ? 'claude is responding — type now, send when done' : 'send a message — enter to send, shift+enter for newline'}
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
              {sessionInfo?.sessionId && (
                <InfoChip k="session" v={sessionInfo.sessionId.slice(0, 8) + '…'} />
              )}
              {sessionInfo?.model && <InfoChip k="model" v={sessionInfo.model} />}
              {typeof sessionInfo?.toolsCount === 'number' && (
                <InfoChip k="tools" v={String(sessionInfo.toolsCount)} />
              )}
              {sessionInfo?.permissionMode && (
                <InfoChip k="perm" v={sessionInfo.permissionMode} />
              )}
              <InfoChip k="cwd" v={thread.cwd} />
            </div>
          </div>
        </div>

        {drawerBubble && (
          <ToolDrawer bubble={drawerBubble} onClose={closeTools} />
        )}
      </div>
    </div>
  );
}

function InfoChip({ k, v }: { k: string; v: string }) {
  return (
    <span className={styles.infoChip}>
      <span className={styles.infoChipKey}>{k}</span>
      <span className={styles.infoChipValue}>{v}</span>
    </span>
  );
}

interface SlashContext {
  start: number;     // index in input where the slash token starts
  tokenEnd: number;  // index in input where the slash token ends (exclusive)
  query: string;     // text typed so far between the slash and the caret
}

// Find the slash token containing the caret, if any. The token runs from the
// preceding whitespace (or start of input) up to the next whitespace (or end).
// We use only the portion *before* the caret as the filter query so users can
// edit mid-token without the popover jumping around on them.
function getActiveSlashContext(input: string, caret: number): SlashContext | null {
  let start = caret;
  while (start > 0 && !/\s/.test(input[start - 1])) start--;
  let tokenEnd = caret;
  while (tokenEnd < input.length && !/\s/.test(input[tokenEnd])) tokenEnd++;
  const typed = input.slice(start, caret);
  if (!/^\/[\w:-]*$/.test(typed)) return null;
  return { start, tokenEnd, query: typed.slice(1) };
}

interface ItemRowProps {
  item: RenderItem;
  isLast: boolean;
  openToolMsgId: string | null;
  onToggleTools: (msgId: string) => void;
}

function ItemRow({ item, isLast, openToolMsgId, onToggleTools }: ItemRowProps) {
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
          <div className={styles.bubbleBody}>
            <MarkdownContent text={item.content} />
          </div>
        </div>
        <div className={styles.bubbleAux} />
      </div>
    );
  }

  if (item.kind === 'assistant') {
    const { bubble, isStreaming } = item;
    const hasText = !!bubble.text.trim();
    const hasTools = bubble.toolCalls.length > 0;
    const isToolDrawerOpen = openToolMsgId === bubble.msgId;

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
            {hasText ? (
              <MarkdownContent text={bubble.text} />
            ) : !hasTools && isStreaming ? (
              <span className={styles.streamingCaret}>▍</span>
            ) : !hasTools ? (
              <div className={styles.workingNote}>working…</div>
            ) : null}
          </div>
        </div>
        <div className={styles.bubbleAux}>
          {hasTools && (
            <button
              type="button"
              className={`${styles.toolsButton} ${isToolDrawerOpen ? styles.toolsButtonActive : ''}`}
              onClick={() => onToggleTools(bubble.msgId)}
              title="show tool calls"
            >
              <Wrench size={11} className={styles.toolsButtonGlyph} />
              <span>{bubble.toolCalls.length} {bubble.toolCalls.length === 1 ? 'tool' : 'tools'}</span>
            </button>
          )}
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
        <div className={styles.bubbleAux} />
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
      <div className={styles.bubbleAux} />
    </div>
  );
}
