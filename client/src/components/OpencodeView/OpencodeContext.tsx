import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadThread, resetThread, streamMessage } from './api';
import type { OpenCodeEvent, OpenCodeThread } from './types';

interface StreamingUser {
  id: string;
  content: string;
}

interface OpencodeContextValue {
  thread: OpenCodeThread | null;
  loadError: string | null;
  chatError: string | null;
  streamingEvents: OpenCodeEvent[] | null;
  streamingUser: StreamingUser | null;
  isStreaming: boolean;
  unread: boolean;
  draft: string;
  setDraft: (text: string) => void;
  openFileRef: (path: string, line: number) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  reset: () => Promise<void>;
  clearChatError: () => void;
}

const OpencodeContext = createContext<OpencodeContextValue | null>(null);

interface OpencodeProviderProps {
  children: ReactNode;
  isActive: boolean;
  onOpenFileRef: (path: string, line: number) => void;
}

export function OpencodeProvider({ children, isActive, onOpenFileRef }: OpencodeProviderProps) {
  const [thread, setThread] = useState<OpenCodeThread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [streamingEvents, setStreamingEvents] = useState<OpenCodeEvent[] | null>(null);
  const [streamingUser, setStreamingUser] = useState<StreamingUser | null>(null);
  const [unread, setUnread] = useState(false);
  const [draft, setDraft] = useState('');

  const stopRef = useRef<AbortController | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  useEffect(() => {
    let cancelled = false;
    loadThread()
      .then((t) => { if (!cancelled) setThread(t); })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, []);

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
        if (channel === 'opencode') {
          setStreamingEvents((prev) => (prev ? [...prev, data as OpenCodeEvent] : [data as OpenCodeEvent]));
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
      setUnread(false);
    } catch (err) {
      setChatError((err as Error).message);
    }
  }, [streamingEvents, thread]);

  const clearChatError = useCallback(() => {
    setChatError(null);
  }, []);

  const value = useMemo<OpencodeContextValue>(() => ({
    thread,
    loadError,
    chatError,
    streamingEvents,
    streamingUser,
    isStreaming: streamingEvents !== null,
    unread,
    draft,
    setDraft,
    openFileRef: onOpenFileRef,
    send,
    stop,
    reset,
    clearChatError,
  }), [thread, loadError, chatError, streamingEvents, streamingUser, unread, draft, onOpenFileRef, send, stop, reset, clearChatError]);

  return <OpencodeContext.Provider value={value}>{children}</OpencodeContext.Provider>;
}

export function useOpencode(): OpencodeContextValue {
  const ctx = useContext(OpencodeContext);
  if (!ctx) throw new Error('useOpencode must be used inside <OpencodeProvider>');
  return ctx;
}
