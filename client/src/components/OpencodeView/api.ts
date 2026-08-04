import type { OpenCodeThread } from './types';

export async function loadThread(): Promise<OpenCodeThread> {
  const r = await fetch('/api/opencode/thread');
  if (!r.ok) throw new Error(`loadThread ${r.status}`);
  return r.json();
}

export async function resetThread(): Promise<OpenCodeThread> {
  const r = await fetch('/api/opencode/thread/reset', { method: 'POST' });
  if (!r.ok) throw new Error(`resetThread ${r.status}`);
  return r.json();
}

export interface StreamEvent {
  channel: 'local' | 'opencode';
  data: Record<string, unknown>;
}

export async function streamMessage(
  content: string,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const resp = await fetch('/api/opencode/thread/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    throw new Error(`streamMessage ${resp.status}: ${text}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let channel: 'local' | 'opencode' = 'local';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          const tag = line.slice(6).trim();
          if (tag === 'opencode' || tag === 'local') channel = tag;
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^\s/, ''));
        }
      }
      if (!dataLines.length) continue;
      try {
        const payload = JSON.parse(dataLines.join('\n'));
        onEvent({ channel, data: payload });
      } catch {
        // skip malformed
      }
    }
  }
}
