import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadThread, resetThread, streamMessage, loadSlashCommands } from './api';
import type { ClaudeEvent, Thread } from './types';

interface StreamingUser {
  id: string;
  content: string;
}

interface ClaudeContextValue {
  thread: Thread | null;
  loadError: string | null;
  chatError: string | null;
  streamingEvents: ClaudeEvent[] | null;
  streamingUser: StreamingUser | null;
  isStreaming: boolean;
  openToolMsgId: string | null;
  unread: boolean;
  cachedSlashCommands: string[];
  draft: string;
  setDraft: (text: string) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  reset: () => Promise<void>;
  toggleTools: (msgId: string) => void;
  closeTools: () => void;
  clearChatError: () => void;
}

const ClaudeContext = createContext<ClaudeContextValue | null>(null);

interface ClaudeProviderProps {
  children: ReactNode;
  isActive: boolean;
}

export function ClaudeProvider({ children, isActive }: ClaudeProviderProps) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [streamingEvents, setStreamingEvents] = useState<ClaudeEvent[] | null>(null);
  const [streamingUser, setStreamingUser] = useState<StreamingUser | null>(null);
  const [openToolMsgId, setOpenToolMsgId] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const [cachedSlashCommands, setCachedSlashCommands] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const stopRef = useRef<AbortController | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Load the persisted thread once when the provider mounts.
  useEffect(() => {
    let cancelled = false;
    loadThread()
      .then((t) => { if (!cancelled) setThread(t); })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Fetch the slash-command cache (server warms it up on demand if empty) so the
  // composer's autocomplete has something to show before the first turn.
  useEffect(() => {
    let cancelled = false;
    loadSlashCommands()
      .then((cmds) => { if (!cancelled) setCachedSlashCommands(cmds); })
      .catch(() => { /* tolerate failure — popover just stays empty */ });
    return () => { cancelled = true; };
  }, []);

  // When the user enters the Claude view, clear the unread flag.
  useEffect(() => {
    if (isActive) setUnread(false);
  }, [isActive]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !thread || streamingEvents !== null) return;
    setChatError(null);

    const userNode: StreamingUser = { id: `u${Date.now()}`, content: trimmed };
    setStreamingUser(userNode);
    setStreamingEvents([]);

    const ctrl = new AbortController();
    stopRef.current = ctrl;

    try {
      await streamMessage(trimmed, ({ channel, data }) => {
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
                if (!isActiveRef.current) setUnread(true);
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
  }, [thread, streamingEvents]);

  const stop = useCallback(() => {
    if (stopRef.current) {
      stopRef.current.abort();
      stopRef.current = null;
    }
  }, []);

  const reset = useCallback(async () => {
    if (streamingEvents !== null) return;
    if (thread && thread.nodes.length > 0) {
      const ok = window.confirm('Start a new conversation? This clears the current thread.');
      if (!ok) return;
    }
    try {
      const fresh = await resetThread();
      setThread(fresh);
      setChatError(null);
      setOpenToolMsgId(null);
      setUnread(false);
    } catch (err) {
      setChatError((err as Error).message);
    }
  }, [streamingEvents, thread]);

  const toggleTools = useCallback((msgId: string) => {
    setOpenToolMsgId((prev) => (prev === msgId ? null : msgId));
  }, []);

  const closeTools = useCallback(() => {
    setOpenToolMsgId(null);
  }, []);

  const clearChatError = useCallback(() => {
    setChatError(null);
  }, []);

  const value = useMemo<ClaudeContextValue>(() => ({
    thread,
    loadError,
    chatError,
    streamingEvents,
    streamingUser,
    isStreaming: streamingEvents !== null,
    openToolMsgId,
    unread,
    cachedSlashCommands,
    draft,
    setDraft,
    send,
    stop,
    reset,
    toggleTools,
    closeTools,
    clearChatError,
  }), [thread, loadError, chatError, streamingEvents, streamingUser, openToolMsgId, unread, cachedSlashCommands, draft, send, stop, reset, toggleTools, closeTools, clearChatError]);

  return <ClaudeContext.Provider value={value}>{children}</ClaudeContext.Provider>;
}

export function useClaude(): ClaudeContextValue {
  const ctx = useContext(ClaudeContext);
  if (!ctx) throw new Error('useClaude must be used inside <ClaudeProvider>');
  return ctx;
}
