import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, RotateCcw, ChevronRight, Copy, Eraser, RefreshCw, Pin } from 'lucide-react';
import { useScripts } from './ScriptsContext';
import type { RunState, ScriptDefinition } from './types';
import styles from './ScriptsPanel.module.css';

export function ScriptsPanel() {
  const { scripts, scriptsError, latestRun, expandedScript, pinned, refresh, run, stop, toggleExpand, togglePin } = useScripts();

  const groups = useMemo(() => groupScripts(scripts, pinned), [scripts, pinned]);

  const renderRow = (s: ScriptDefinition) => {
    const lr = latestRun[s.name];
    const isPinned = pinned.has(s.name);
    const isPinnable = s.kind !== 'preset';
    return (
      <ScriptRow
        key={s.name}
        script={s}
        latestRun={lr}
        expanded={expandedScript === s.name}
        pinned={isPinned}
        pinnable={isPinnable}
        onToggleExpand={() => toggleExpand(s.name)}
        onRun={() => void run(s.name)}
        onStop={() => lr && void stop(lr.runId)}
        onTogglePin={() => togglePin(s.name)}
      />
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.title}>Scripts</span>
        <button
          className={styles.toolbarBtn}
          onClick={() => void refresh()}
          title="Re-read package.json"
        >
          <RefreshCw size={12} />
          <span>refresh</span>
        </button>
      </div>

      {scriptsError && (
        <div className={styles.error}>{scriptsError}</div>
      )}

      <div className={styles.list}>
        {scripts.length === 0 ? (
          <div className={styles.emptyState}>
            no scripts in package.json
          </div>
        ) : (
          <>
            {groups.preset.map(renderRow)}
            {groups.pinned.length > 0 && (
              <>
                <div className={styles.sectionLabel}>pinned</div>
                {groups.pinned.map(renderRow)}
              </>
            )}
            {groups.unpinned.length > 0 && (
              <>
                {groups.pinned.length > 0 && <div className={styles.sectionLabel}>all</div>}
                {groups.unpinned.map(renderRow)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface ScriptGroups {
  preset: ScriptDefinition[];
  pinned: ScriptDefinition[];
  unpinned: ScriptDefinition[];
}

function groupScripts(scripts: ScriptDefinition[], pinned: Set<string>): ScriptGroups {
  const result: ScriptGroups = { preset: [], pinned: [], unpinned: [] };
  for (const s of scripts) {
    if (s.kind === 'preset') {
      result.preset.push(s);
    } else if (pinned.has(s.name)) {
      result.pinned.push(s);
    } else {
      result.unpinned.push(s);
    }
  }
  return result;
}

interface ScriptRowProps {
  script: ScriptDefinition;
  latestRun: RunState | undefined;
  expanded: boolean;
  pinned: boolean;
  pinnable: boolean;
  onToggleExpand: () => void;
  onRun: () => void;
  onStop: () => void;
  onTogglePin: () => void;
}

function ScriptRow({ script, latestRun, expanded, pinned, pinnable, onToggleExpand, onRun, onStop, onTogglePin }: ScriptRowProps) {
  const status = latestRun?.status ?? 'idle';
  const isRunning = status === 'running';

  return (
    <div className={styles.row} data-expanded={expanded ? 'true' : 'false'} data-kind={script.kind}>
      <button className={styles.rowHeader} onClick={onToggleExpand}>
        <ChevronRight size={11} className={styles.chev} />
        <span className={styles.rowName}>{script.name}</span>
        <span className={styles.rowStatus} data-status={status}>
          <StatusDot status={status} />
          <StatusLabel run={latestRun} />
        </span>
      </button>
      <div className={styles.rowAction} onClick={(e) => e.stopPropagation()}>
        {pinnable && (
          <button
            type="button"
            className={`${styles.pinBtn} ${pinned ? styles.pinBtnActive : ''}`}
            onClick={onTogglePin}
            title={pinned ? 'Unpin' : 'Pin'}
          >
            <Pin size={11} fill={pinned ? 'currentColor' : 'none'} />
          </button>
        )}
        {isRunning ? (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnStop}`}
            onClick={onStop}
            title="Stop"
          >
            <Square size={11} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onRun}
            title={status === 'idle' ? 'Run' : 'Run again'}
          >
            {status === 'idle' ? <Play size={11} /> : <RotateCcw size={11} />}
          </button>
        )}
      </div>
      {expanded && (
        <ExpandedBody command={script.command} run={latestRun} onRun={onRun} onStop={onStop} />
      )}
    </div>
  );
}

interface ExpandedBodyProps {
  command: string;
  run: RunState | undefined;
  onRun: () => void;
  onStop: () => void;
}

function ExpandedBody({ command, run, onRun, onStop }: ExpandedBodyProps) {
  const { logs, clearLogs } = useScripts();
  const lines = run ? logs[run.runId] || [] : [];
  const logRef = useRef<HTMLPreElement>(null);
  const stickToBottomRef = useRef(true);

  // Stick to bottom while streaming
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickToBottomRef.current = dist < 24;
  };

  const isRunning = run?.status === 'running';

  const copyAll = () => {
    if (lines.length === 0) return;
    void navigator.clipboard.writeText(lines.join('\n'));
  };

  return (
    <div className={styles.expanded}>
      <div className={styles.expandedMeta}>
        <code className={styles.expandedCommand}>{command}</code>
        {run && <RunMetadata run={run} />}
      </div>
      <pre ref={logRef} className={styles.logBox} onScroll={onScroll}>
        {lines.length === 0 ? (
          <span className={styles.logEmpty}>{run ? 'no output yet' : 'not run yet'}</span>
        ) : (
          lines.join('\n')
        )}
      </pre>
      <div className={styles.expandedActions}>
        {isRunning ? (
          <button type="button" className={styles.expandedAction} onClick={onStop}>
            <Square size={11} />
            <span>stop</span>
          </button>
        ) : (
          <button type="button" className={styles.expandedAction} onClick={onRun}>
            {run ? <RotateCcw size={11} /> : <Play size={11} />}
            <span>{run ? 'rerun' : 'run'}</span>
          </button>
        )}
        <button
          type="button"
          className={styles.expandedAction}
          onClick={copyAll}
          disabled={lines.length === 0}
        >
          <Copy size={11} />
          <span>copy</span>
        </button>
        <button
          type="button"
          className={styles.expandedAction}
          onClick={() => run && clearLogs(run.runId)}
          disabled={!run || lines.length === 0}
        >
          <Eraser size={11} />
          <span>clear</span>
        </button>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return <span className={styles.statusDot} data-status={status} />;
}

function StatusLabel({ run }: { run: RunState | undefined }) {
  const [, force] = useState(0);
  // tick every second while running so duration updates live
  useEffect(() => {
    if (!run || run.status !== 'running') return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [run]);

  if (!run) return <span className={styles.statusText}>idle</span>;

  const end = run.endedAt ?? Date.now();
  const duration = formatDuration(end - run.startedAt);

  if (run.status === 'running') {
    return <span className={styles.statusText}>running · {duration}</span>;
  }
  if (run.status === 'done') {
    return <span className={styles.statusText}>ran {duration}</span>;
  }
  if (run.status === 'failed') {
    const code = run.exitCode != null ? ` (exit ${run.exitCode})` : '';
    return <span className={styles.statusText}>failed{code} · {duration}</span>;
  }
  if (run.status === 'stopped') {
    return <span className={styles.statusText}>stopped · {duration}</span>;
  }
  return <span className={styles.statusText}>{run.status}</span>;
}

function RunMetadata({ run }: { run: RunState }) {
  const startedAgo = formatRelativeTime(Date.now() - run.startedAt);
  return (
    <span className={styles.runMeta}>
      <span>started {startedAgo}</span>
      {run.exitCode != null && run.endedAt != null && (
        <span> · exit {run.exitCode}</span>
      )}
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}.${Math.floor((ms % 1000) / 100)}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function formatRelativeTime(ms: number): string {
  if (ms < 1000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
