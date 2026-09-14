export const ASTRA_MODEL = 'gpt-6-astra';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = typeof EFFORTS[number];
export type RunState = 'preparing' | 'awaiting_model' | 'awaiting_apply' | 'checking' | 'completed' | 'stopped' | 'failed' | 'budget_exhausted' | 'interrupted';
export interface BuilderOperation { id: string; capability: string; args: unknown[]; summary: string }
export interface BuilderRun {
  id: string;
  board_id: string | null;
  state: RunState;
  effort: Effort;
  steps: number;
  spent_micros: number;
  pending: BuilderOperation[];
  message: string;
}
export const terminalRun = (state: RunState) => ['completed', 'stopped', 'failed', 'budget_exhausted', 'interrupted'].includes(state);
export const validEffort = (value: unknown): value is Effort => EFFORTS.includes(value as Effort);

export interface ConversationMessage { role: 'user' | 'assistant'; content: string }
/** Conversation is untrusted text, never provider tools or privileged messages. */
export function conversationMessages(value: unknown): ConversationMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 24) throw new Error('The conversation is too long. Start a new chat.');
  let length = 0;
  return value.map(item => {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 8000) throw new Error('Invalid conversation message.');
    length += item.content.length;
    if (length > 32000) throw new Error('The conversation is too long. Start a new chat.');
    return { role: item.role, content: item.content };
  });
}

/** Bound untrusted model/input JSON before schema validation or persistence. */
export function boundedJson(value: unknown, maxBytes = 120_000): void {
  const source = JSON.stringify(value);
  if (!source || new TextEncoder().encode(source).length > maxBytes) throw new Error('The operation is too large. Use smaller batches.');
  function visit(item: unknown, depth: number) {
    if (depth > 24) throw new Error('The operation is too deeply nested.');
    if (typeof item === 'number' && (!Number.isFinite(item) || Math.abs(item) > Number.MAX_SAFE_INTEGER)) throw new Error('Use finite, bounded numbers.');
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid object field.');
        visit(child, depth + 1);
      }
    }
  }
  visit(value, 0);
}
