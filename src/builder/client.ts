import { authenticatedFetch, authenticatedIdToken, clientSessionId } from '../services/apiClient';
import type { BuilderRun, ConversationMessage, Effort } from './protocol';

export interface BuilderSession { runId: string; lease: string }
export const builderStatus = () => authenticatedFetch<{ enabled: boolean; remainingMicros: number; unmetered?: boolean; operator?: boolean }>('/api/builder');
export interface BuilderUsage { enabled: boolean; caps: Record<string, number>; runs: Array<{ id: string; user_id: string; state: string; steps: number; spent_micros: number }>; reservations: Array<{ id: string; run_id: string; status: string; reserved_micros: number; provider_response_id: string | null }> }
export const builderUsage = () => authenticatedFetch<BuilderUsage>('/api/builder?scope=usage');
export const builderRequest = (session: BuilderSession, action: string, input: Record<string, unknown> = {}) =>
  authenticatedFetch<{ run: BuilderRun; operation?: { status: string; result: unknown } }>('/api/builder', { method: 'POST', body: JSON.stringify({ ...session, ...input, action }) });
export const createBuilderRun = (session: BuilderSession, prompt: string, effort: Effort, scope: string, boardId: string | null, roomId: string | null, selectionIds: string[], conversation: ConversationMessage[] = []) =>
  builderRequest(session, 'create', { prompt, effort, scope, boardId, roomId, selectionIds, conversation });

export async function builderStep(session: BuilderSession, context: string, signal: AbortSignal, onProgress: (message: string) => void, onTextDelta: (delta: string) => void = () => {}): Promise<BuilderRun> {
  const token = await authenticatedIdToken();
  if (!token) throw new Error('Authentication required.');
  const response = await fetch('/api/builder', { method: 'POST', signal, headers: { Authorization: `Bearer ${token}`, 'X-Kumo-Session-Id': clientSessionId(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...session, action: 'step', context }) });
  if (!response.ok) { const body = await response.json() as { error: string }; throw new Error(body.error); }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return (await response.json() as { run: BuilderRun }).run;
  if (!response.body) throw new Error('The builder stream is unavailable.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let run: BuilderRun | undefined;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 250000) throw new Error('The builder response was too large.');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trimEnd(); buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data: ')) continue;
        const event = JSON.parse(line.slice(6)) as { type: string; message: string; run: BuilderRun; delta?: string };
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'progress') onProgress(event.message);
        if (event.type === 'text_delta' && typeof event.delta === 'string') onTextDelta(event.delta);
        if (event.type === 'run') run = event.run;
      }
    }
  } finally { await reader.cancel(); }
  if (!run) throw new Error('The builder disconnected. Check the run status before continuing.');
  return run;
}

export function summarizeResult(value: unknown) {
  const json = JSON.stringify(value, (key, item) => /^(password|authorization|apiKey|accessToken|refreshToken)$/i.test(key) ? '[redacted]' : item);
  return json.length <= 16000 ? JSON.parse(json) as unknown : { preview: json.slice(0, 15000), truncated: true, message: 'Inspect a smaller set of objects for complete details.' };
}
