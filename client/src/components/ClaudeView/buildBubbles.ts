import type { ClaudeEvent } from './types';

export interface AssistantBubble {
  msgId: string;
  text: string;
  toolNames: string[];
}

export interface BuiltTurn {
  bubbles: AssistantBubble[];
  resultEvent: { type: 'result'; is_error?: boolean; result?: string; error?: string } | null;
}

// Slice 1: collapse all assistant text-block deltas per message id, collect tool_use names as pills.
// We re-walk the events array on every render — fine at conversation scale.
export function buildTurnBubbles(events: ClaudeEvent[]): BuiltTurn {
  const byId = new Map<string, AssistantBubble>();
  let resultEvent: BuiltTurn['resultEvent'] = null;

  const ensure = (id: string): AssistantBubble => {
    let b = byId.get(id);
    if (!b) {
      b = { msgId: id, text: '', toolNames: [] };
      byId.set(id, b);
    }
    return b;
  };

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const type = (ev as { type?: string }).type;

    if (type === 'assistant') {
      const msg = (ev as { message?: { id?: string; content?: unknown } }).message;
      const id = msg?.id;
      if (!id || !Array.isArray(msg?.content)) continue;
      const bubble = ensure(id);
      for (const block of msg.content as Array<{ type: string; text?: string; name?: string }>) {
        if (block.type === 'text' && typeof block.text === 'string') {
          bubble.text += block.text;
        } else if (block.type === 'tool_use' && typeof block.name === 'string') {
          if (!bubble.toolNames.includes(block.name)) {
            bubble.toolNames.push(block.name);
          }
        }
      }
    } else if (type === 'stream_event') {
      // partial-message delta — claude --include-partial-messages emits these.
      // shape: { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } }, parent_tool_use_id, session_id, ... }
      const msgId = (ev as { message_id?: string }).message_id ?? (ev as { parent_message_id?: string }).parent_message_id;
      const inner = (ev as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event;
      if (msgId && inner?.delta?.type === 'text_delta' && typeof inner.delta.text === 'string') {
        ensure(msgId).text += inner.delta.text;
      }
    } else if (type === 'result') {
      resultEvent = ev as BuiltTurn['resultEvent'];
    }
  }

  return { bubbles: Array.from(byId.values()), resultEvent };
}
