import type { ClaudeEvent } from './types';

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  result?: unknown;
  isError?: boolean;
}

export interface AssistantBubble {
  msgId: string;
  text: string;
  toolCalls: ToolCall[];
  thinking: string[];
}

export interface SystemNoteEvent {
  subtype?: string;
  session_id?: string;
  model?: string;
  cwd?: string;
  tools?: unknown[];
  permissionMode?: string;
  attempt?: number;
  max_retries?: number;
  error?: string;
  [k: string]: unknown;
}

export interface BuiltTurn {
  bubbles: AssistantBubble[];
  systemNotes: SystemNoteEvent[];
  resultEvent: { is_error?: boolean; result?: string; error?: string } | null;
}

interface RawBubble extends AssistantBubble {
  seenTools: Set<string>;
  seenTextHashes: Set<string>;
}

interface ToolResultRecord {
  content: unknown;
  isError: boolean;
}

// Group assistant events by message.id; each unique id becomes a bubble.
// tool_use blocks are matched with their tool_result by tool_use_id (which arrives
// in a later `user` event in the same turn).
export function buildTurnBubbles(events: ClaudeEvent[]): BuiltTurn {
  if (!events || events.length === 0) {
    return { bubbles: [], systemNotes: [], resultEvent: null };
  }

  const toolResults = new Map<string, ToolResultRecord>();
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as { type?: string; message?: { content?: unknown } };
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      for (const c of e.message!.content as Array<{ type: string; tool_use_id?: string; content?: unknown; is_error?: boolean }>) {
        if (c.type === 'tool_result' && c.tool_use_id) {
          toolResults.set(c.tool_use_id, { content: c.content, isError: !!c.is_error });
        }
      }
    }
  }

  const order: string[] = [];
  const map = new Map<string, RawBubble>();
  const systemNotes: SystemNoteEvent[] = [];
  let resultEvent: BuiltTurn['resultEvent'] = null;

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as { type?: string; message?: { id?: string; content?: unknown } };

    if (e.type === 'system') {
      systemNotes.push(ev as SystemNoteEvent);
      continue;
    }
    if (e.type === 'result') {
      resultEvent = ev as BuiltTurn['resultEvent'];
      continue;
    }
    if (e.type === 'stream_event') {
      // Partial-message text deltas from --include-partial-messages.
      // Aggregate into the bubble matching message_id.
      const se = ev as { message_id?: string; parent_message_id?: string; event?: { type?: string; delta?: { type?: string; text?: string } } };
      const msgId = se.message_id ?? se.parent_message_id;
      if (msgId && se.event?.delta?.type === 'text_delta' && typeof se.event.delta.text === 'string') {
        const bubble = ensureBubble(map, order, msgId);
        bubble.text += se.event.delta.text;
      }
      continue;
    }
    if (e.type !== 'assistant') continue;

    const msg = e.message;
    if (!msg || !msg.id) continue;
    const bubble = ensureBubble(map, order, msg.id);

    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const c of content as Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown; thinking?: string }>) {
      if (c.type === 'text' && typeof c.text === 'string') {
        const h = c.text.length + ':' + c.text.slice(0, 40);
        if (!bubble.seenTextHashes.has(h)) {
          bubble.seenTextHashes.add(h);
          bubble.text += c.text;
        }
      } else if (c.type === 'tool_use' && c.id && c.name) {
        if (!bubble.seenTools.has(c.id)) {
          bubble.seenTools.add(c.id);
          const r = toolResults.get(c.id);
          bubble.toolCalls.push({
            id: c.id,
            name: c.name,
            input: c.input,
            result: r?.content,
            isError: r?.isError,
          });
        } else {
          // tool_use was added before its result arrived — patch it in.
          const existing = bubble.toolCalls.find((t) => t.id === c.id);
          if (existing && existing.result === undefined) {
            const r = toolResults.get(c.id);
            if (r) {
              existing.result = r.content;
              existing.isError = r.isError;
            }
          }
        }
      } else if (c.type === 'thinking' && typeof c.thinking === 'string') {
        bubble.thinking.push(c.thinking);
      }
    }
  }

  // Patch in any tool results whose tool_use was added before the result event arrived.
  for (const id of order) {
    const b = map.get(id)!;
    for (const tc of b.toolCalls) {
      if (tc.result === undefined && toolResults.has(tc.id)) {
        const r = toolResults.get(tc.id)!;
        tc.result = r.content;
        tc.isError = r.isError;
      }
    }
  }

  const raw = order.map((id) => map.get(id)!);
  return {
    bubbles: compactBubbles(raw),
    systemNotes,
    resultEvent,
  };
}

function ensureBubble(map: Map<string, RawBubble>, order: string[], msgId: string): RawBubble {
  let bubble = map.get(msgId);
  if (!bubble) {
    bubble = {
      msgId,
      text: '',
      toolCalls: [],
      thinking: [],
      seenTools: new Set(),
      seenTextHashes: new Set(),
    };
    map.set(msgId, bubble);
    order.push(msgId);
  }
  return bubble;
}

// Fold tool-only bubbles into the next bubble that has text, so a turn renders
// as one [text + leading tool calls] bubble rather than a chain of empty
// "tool-only" bubbles. Trailing tool-only bubbles (no text yet — still
// streaming, or turn ended without a final text response) get a stable
// 'tools-pending' msgId so the DOM stays put as more tool events arrive.
function compactBubbles(bubbles: RawBubble[]): AssistantBubble[] {
  const out: AssistantBubble[] = [];
  let pendingTools: ToolCall[] = [];
  let pendingThinking: string[] = [];
  for (const b of bubbles) {
    const hasText = !!(b.text && b.text.trim());
    if (!hasText) {
      pendingTools.push(...b.toolCalls);
      pendingThinking.push(...b.thinking);
      continue;
    }
    out.push({
      msgId: b.msgId,
      text: b.text,
      toolCalls: [...pendingTools, ...b.toolCalls],
      thinking: [...pendingThinking, ...b.thinking],
    });
    pendingTools = [];
    pendingThinking = [];
  }
  if (pendingTools.length > 0 || pendingThinking.length > 0) {
    out.push({
      msgId: 'tools-pending',
      text: '',
      toolCalls: pendingTools,
      thinking: pendingThinking,
    });
  }
  return out;
}
