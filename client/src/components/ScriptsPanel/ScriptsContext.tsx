import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listScripts, listRuns, runScript as apiRunScript, stopRun as apiStopRun, fetchLogs } from './api';
import type { RunState, ScriptDefinition, ScriptWsMessage } from './types';
import { useProjectInfo } from '../../hooks/useFileTree';

interface ScriptsContextValue {
  scripts: ScriptDefinition[];
  scriptsError: string | null;
  // latest run per scriptName (or undefined if never run)
  latestRun: Record<string, RunState | undefined>;
  // log lines per runId (only populated for runs whose row has been expanded at least once)
  logs: Record<string, string[]>;
  expandedScript: string | null;
  pinned: Set<string>;
  refresh: () => Promise<void>;
  run: (name: string) => Promise<void>;
  stop: (runId: string) => Promise<void>;
  toggleExpand: (name: string) => void;
  closeExpand: () => void;
  clearLogs: (runId: string) => void;
  togglePin: (name: string) => void;
}

const ScriptsContext = createContext<ScriptsContextValue | null>(null);

interface ScriptsProviderProps {
  children: ReactNode;
}

export function ScriptsProvider({ children }: ScriptsProviderProps) {
  const { data: projectInfo } = useProjectInfo();
  const projectPath = projectInfo?.path;

  const [scripts, setScripts] = useState<ScriptDefinition[]>([]);
  const [scriptsError, setScriptsError] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<Record<string, RunState | undefined>>({});
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const fetchedLogsRef = useRef<Set<string>>(new Set());

  // Hydrate pinned set from localStorage when we know the project path
  useEffect(() => {
    if (!projectPath) return;
    try {
      const raw = localStorage.getItem(pinnedKey(projectPath));
      if (!raw) {
        setPinned(new Set());
        return;
      }
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) setPinned(new Set(arr));
    } catch {
      setPinned(new Set());
    }
  }, [projectPath]);

  const refresh = useCallback(async () => {
    setScriptsError(null);
    try {
      const [scriptList, runs] = await Promise.all([listScripts(), listRuns()]);
      setScripts(scriptList);
      setLatestRun((prev) => {
        const next: Record<string, RunState | undefined> = { ...prev };
        // keep prior entries for scripts that no longer have runs
        for (const r of runs) {
          const existing = next[r.scriptName];
          if (!existing || r.startedAt >= existing.startedAt) {
            next[r.scriptName] = r;
          }
        }
        return next;
      });
    } catch (err) {
      setScriptsError((err as Error).message);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // WebSocket subscription for live script events.
  // We open a dedicated connection (the file-watcher hook owns its own).
  // Both connections receive every server broadcast, but each side filters by type.
  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        const msg = payload as ScriptWsMessage;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'scriptUpdate') {
          setLatestRun((prev) => {
            const existing = prev[msg.state.scriptName];
            // Always accept updates for the current latest run, or a newer one.
            if (existing && existing.runId === msg.state.runId) {
              return { ...prev, [msg.state.scriptName]: msg.state };
            }
            if (!existing || msg.state.startedAt >= existing.startedAt) {
              return { ...prev, [msg.state.scriptName]: msg.state };
            }
            return prev;
          });
        } else if (msg.type === 'scriptOutput') {
          // Only retain logs for runs we've already started tracking (i.e. fetched once
          // via expand, or seeded by a recent run() call). This keeps memory bounded.
          if (!fetchedLogsRef.current.has(msg.runId)) return;
          setLogs((prev) => {
            const existing = prev[msg.runId] || [];
            // mirror server cap to keep memory bounded
            const next = existing.length >= 500 ? existing.slice(existing.length - 499) : existing.slice();
            next.push(msg.line);
            return { ...prev, [msg.runId]: next };
          });
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        wsRef.current = null;
        reconnectTimerRef.current = window.setTimeout(connect, 2000);
        // also re-sync run state on reconnect to catch up on any missed events
      };
      ws.onerror = () => {
        try { ws.close(); } catch { /* noop */ }
      };
      ws.onopen = () => {
        // Re-sync state when (re)connected
        void refresh();
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* noop */ }
        wsRef.current = null;
      }
    };
  }, [refresh]);

  // When a script row is expanded, ensure we have its logs seeded from the server.
  useEffect(() => {
    if (!expandedScript) return;
    const run = latestRun[expandedScript];
    if (!run) return;
    if (fetchedLogsRef.current.has(run.runId)) return;
    fetchedLogsRef.current.add(run.runId);
    void fetchLogs(run.runId).then((seed) => {
      setLogs((prev) => ({ ...prev, [run.runId]: seed }));
    }).catch(() => {
      fetchedLogsRef.current.delete(run.runId);
    });
  }, [expandedScript, latestRun]);

  const run = useCallback(async (name: string) => {
    try {
      const state = await apiRunScript(name);
      // Seed logs entry so subsequent WS events get retained, even before expand.
      fetchedLogsRef.current.add(state.runId);
      setLogs((prev) => ({ ...prev, [state.runId]: [] }));
      setLatestRun((prev) => ({ ...prev, [state.scriptName]: state }));
    } catch (err) {
      setScriptsError((err as Error).message);
    }
  }, []);

  const stop = useCallback(async (runId: string) => {
    try {
      await apiStopRun(runId);
    } catch (err) {
      setScriptsError((err as Error).message);
    }
  }, []);

  const toggleExpand = useCallback((name: string) => {
    setExpandedScript((prev) => (prev === name ? null : name));
  }, []);

  const closeExpand = useCallback(() => {
    setExpandedScript(null);
  }, []);

  const clearLogs = useCallback((runId: string) => {
    setLogs((prev) => ({ ...prev, [runId]: [] }));
  }, []);

  const togglePin = useCallback((name: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      if (projectPath) {
        try {
          localStorage.setItem(pinnedKey(projectPath), JSON.stringify(Array.from(next)));
        } catch {
          // ignore quota / availability errors
        }
      }
      return next;
    });
  }, [projectPath]);

  const value = useMemo<ScriptsContextValue>(() => ({
    scripts,
    scriptsError,
    latestRun,
    logs,
    expandedScript,
    pinned,
    refresh,
    run,
    stop,
    toggleExpand,
    closeExpand,
    clearLogs,
    togglePin,
  }), [scripts, scriptsError, latestRun, logs, expandedScript, pinned, refresh, run, stop, toggleExpand, closeExpand, clearLogs, togglePin]);

  return <ScriptsContext.Provider value={value}>{children}</ScriptsContext.Provider>;
}

export function useScripts(): ScriptsContextValue {
  const ctx = useContext(ScriptsContext);
  if (!ctx) throw new Error('useScripts must be used inside <ScriptsProvider>');
  return ctx;
}

function pinnedKey(projectPath: string): string {
  return `coast-guard:pinned-scripts:${projectPath}`;
}
