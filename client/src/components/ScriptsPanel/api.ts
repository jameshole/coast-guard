import type { RunState, ScriptDefinition } from './types';

export async function listScripts(): Promise<ScriptDefinition[]> {
  const r = await fetch('/api/scripts');
  if (!r.ok) throw new Error(`listScripts ${r.status}`);
  return r.json();
}

export async function listRuns(): Promise<RunState[]> {
  const r = await fetch('/api/scripts/runs');
  if (!r.ok) throw new Error(`listRuns ${r.status}`);
  return r.json();
}

export async function runScript(name: string): Promise<RunState> {
  const r = await fetch(`/api/scripts/${encodeURIComponent(name)}/run`, { method: 'POST' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `runScript ${r.status}`);
  return data;
}

export async function stopRun(runId: string): Promise<void> {
  const r = await fetch(`/api/scripts/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST' });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `stopRun ${r.status}`);
  }
}

export async function fetchLogs(runId: string): Promise<string[]> {
  const r = await fetch(`/api/scripts/runs/${encodeURIComponent(runId)}/logs`);
  if (!r.ok) throw new Error(`fetchLogs ${r.status}`);
  const data = (await r.json()) as { logs: string[] };
  return data.logs;
}
