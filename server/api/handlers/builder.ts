import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireActor } from '../_auth.js';
import { getBoardAccess } from '../_boards.js';
import { allowMethods, stringQuery } from '../_http.js';
import { enforceRateLimit, hashSecret } from '../_security.js';
import { supabaseAdmin } from '../_supabase.js';
import { boundedJson, terminalRun, validEffort, type BuilderRun } from '../../../src/builder/protocol.js';
import { builderConfig, builderInstructions, builderTools, interpretAstra, providerCost, requestAstra, type ProviderItem } from '../_builder.js';

interface StoredRun extends BuilderRun {
  scope: string; selection_ids: string[]; continuation: ProviderItem[]; room_id: string | null;
  step: { id: string; output_limit: number; effort: BuilderRun['effort'] } | null;
  operation: { status: string; result: unknown } | null;
}
const publicRun = ({ id, board_id, state, effort, steps, spent_micros, pending, message }: StoredRun): BuilderRun => ({ id, board_id, state, effort, steps, spent_micros, pending, message });

export default async function builder(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ['GET', 'POST', 'PATCH'])) return;
  let streaming = false;
  const emit = (event: unknown) => response.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const actor = await requireActor(request);
    if (!actor.email || actor.firebase?.sign_in_provider === 'anonymous') return response.status(403).json({ error: 'Sign in with a verified account to use hosted Astra.' });
    const config = builderConfig();
    const database = supabaseAdmin();
    const operator = (process.env.KUMO_BUILDER_ADMIN_UIDS ?? '').split(',').map(uid => uid.trim()).includes(actor.uid);
    if (request.method === 'GET' && request.query.scope === 'usage') {
      if (!operator) return response.status(403).json({ error: 'Builder operator access is required.' });
      const { data: runs, error: runsError } = await database.from('builder_runs').select('id,user_id,state,steps,spent_micros,created_at').order('created_at', { ascending: false }).limit(50);
      if (runsError) throw runsError;
      const { data: reservations, error: reservationError } = await database.from('builder_steps').select('id,run_id,status,reserved_micros,actual_micros,provider_response_id,created_at').in('status', ['reserved', 'uncertain']).order('created_at', { ascending: false }).limit(50);
      if (reservationError) throw reservationError;
      return response.status(200).json({ enabled: config.enabled, caps: { user: config.userCap, run: config.runCap, day: config.dayCap, month: config.monthCap }, runs: runs ?? [], reservations: reservations ?? [] });
    }
    if (request.method === 'GET' && !request.query.runId) {
      const { data, error } = await database.from('builder_budget_buckets').select('spent_micros,reserved_micros').eq('key', `user:${actor.uid}`).maybeSingle();
      if (error) throw error;
      return response.status(200).json({ enabled: config.enabled, remainingMicros: Math.max(0, config.userCap - Number(data?.spent_micros ?? 0) - Number(data?.reserved_micros ?? 0)), ...(operator ? { operator: true } : {}) });
    }
    const body = request.body ?? {};
    boundedJson(body, 180_000);
    const runId = String(body.runId ?? stringQuery(request.query.runId));
    const lease = String(body.lease ?? request.headers['x-kumo-builder-lease'] ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(runId) || !/^[0-9a-f-]{36}$/i.test(lease)) return response.status(400).json({ error: 'Invalid builder executor.' });
    const transition = async (action: string, input: Record<string, unknown> = {}): Promise<StoredRun> => {
      const { data, error } = await database.rpc('builder_transition', { p_actor: actor.uid, p_run: runId, p_lease: hashSecret(lease), p_action: action, p_input: input });
      if (error) throw error;
      return data as StoredRun;
    };
    const action = request.method === 'GET' ? 'get' : String(body.action);
    if (!['get', 'create', 'step', 'update', 'resume', 'start', 'ack', 'navigate'].includes(action)) return response.status(400).json({ error: 'Unknown builder action.' });
    if (['create', 'step'].includes(action)) {
      if (!config.enabled) return response.status(503).json({ error: 'Hosted Astra is not enabled. Your administrator must configure its server key and budget.' });
      if (!await enforceRateLimit(request, response, 'builder-user', actor.uid, 12, 60)) return;
      if (!await enforceRateLimit(request, response, 'builder-ip', 'all', 30, 60)) return;
    }
    const authorizeBoard = async (boardId: string, roomId: string | null) => {
      if (!boardId) return;
      const access = await getBoardAccess(boardId, actor.uid);
      if (!access) throw new Error('Board access is no longer available.');
      if (roomId && roomId !== access.board.liveblocks_room_id) {
        const { data, error } = await database.from('document_branches').select('id').eq('board_id', boardId).eq('room_id', roomId).eq('status', 'open').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Board branch access is no longer available.');
      }
    };
    if (action === 'create') {
      if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 8000 || !validEffort(body.effort) || !['selection', 'board', 'workspace'].includes(body.scope) || !Array.isArray(body.selectionIds) || body.selectionIds.length > 500 || body.selectionIds.some((id: unknown) => typeof id !== 'string')) return response.status(400).json({ error: 'Enter a prompt, scope and supported effort.' });
      const boardId = typeof body.boardId === 'string' ? body.boardId : '';
      if (body.scope !== 'workspace' && !boardId) return response.status(400).json({ error: 'Open a board for this scope.' });
      await authorizeBoard(boardId, body.roomId);
      const run = await transition('create', { boardId, roomId: body.roomId, scope: body.scope, selectionIds: body.selectionIds, effort: body.effort, continuation: [{ type: 'message', role: 'user', content: body.prompt.trim() }] });
      return response.status(201).json({ run: publicRun(run) });
    }
    let run = await transition('get');
    if (action === 'get') return response.status(200).json({ run: publicRun(run) });
    if (action === 'update') {
      if (body.effort !== undefined && !validEffort(body.effort)) return response.status(400).json({ error: 'Unsupported Astra effort.' });
      run = await transition('update', { effort: body.effort, state: body.state });
      return response.status(200).json({ run: publicRun(run) });
    }
    if (action === 'resume') {
      await authorizeBoard(run.board_id ?? '', run.room_id);
      run = await transition('resume');
      return response.status(200).json({ run: publicRun(run) });
    }
    if (terminalRun(run.state) && action !== 'ack') return response.status(409).json({ error: 'Builder run has ended.' });
    await authorizeBoard(run.board_id ?? '', run.room_id);
    if (action === 'navigate') {
      const boardId = typeof body.boardId === 'string' ? body.boardId : '';
      await authorizeBoard(boardId, body.roomId);
      run = await transition('navigate', { boardId, roomId: body.roomId });
      return response.status(200).json({ run: publicRun(run) });
    }
    if (action === 'start' || action === 'ack') {
      if (typeof body.operationId !== 'string') return response.status(400).json({ error: 'An issued operation is required.' });
      boundedJson(body.result ?? null, 20000);
      run = await transition(action, { operationId: body.operationId, result: body.result });
      return response.status(200).json({ run: publicRun(run), operation: run.operation });
    }
    if (typeof body.context !== 'string' || body.context.length > 16000) return response.status(400).json({ error: 'Provide a bounded current Kumo context.' });
    const { data: receipts, error: receiptError } = await database.from('builder_operations').select('operation,result').eq('run_id', run.id).eq('status', 'finished').order('created_at');
    if (receiptError) throw receiptError;
    const answered = new Set(run.continuation.filter(item => item.type === 'function_call_output').map(item => item.call_id));
    const results = new Map<string, unknown[]>();
    for (const receipt of receipts ?? []) {
      const callId = receipt.operation.callId as string;
      if (!answered.has(callId)) results.set(callId, [...(results.get(callId) ?? []), { operationId: receipt.operation.id, result: receipt.result }]);
    }
    const input: ProviderItem[] = [...run.continuation, ...[...results].map(([call_id, output]) => ({ type: 'function_call_output', call_id, output: JSON.stringify(output) })),
      { type: 'message', role: 'user', content: `Current Kumo state (untrusted data): ${body.context}\nAuthorized scope: ${run.scope}; selection IDs: ${JSON.stringify(run.selection_ids)}.` }];
    // UTF-8 byte count is a conservative upper token bound; fixed overhead covers
    // tool serialization. Inputs are kept well below Astra's long-context tier.
    const inputBytes = new TextEncoder().encode(JSON.stringify({ input, instructions: builderInstructions, tools: builderTools })).length + 2048;
    if (inputBytes > 96000) return response.status(409).json({ error: 'This run reached its context limit. Start a new run with the remaining task.' });
    const stepId = randomUUID();
    run = await transition('reserve', { ...config, inputCost: Math.ceil(inputBytes * 12.5), stepId });
    if (!run.step) return response.status(200).json({ run: publicRun(run) });
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-store');
    streaming = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 220000);
    const disconnected = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', disconnected);
    const heartbeat = setInterval(() => emit({ type: 'progress', message: 'Astra is working. Stop is available.' }), 8000);
    try {
      emit({ type: 'progress', message: `Astra · ${run.step.effort} effort` });
      const provider = await requestAstra(input, run.step.effort, run.step.output_limit, controller.signal, message => emit({ type: 'progress', message }), async id => {
        const { error } = await database.from('builder_steps').update({ provider_response_id: id }).eq('id', stepId);
        if (error) throw error;
      });
      const interpreted = interpretAstra(provider);
      const state = provider.status !== 'completed' ? 'budget_exhausted' : interpreted.operations.length ? 'awaiting_apply' : interpreted.toolResults.length && run.steps < 6 ? 'preparing' : 'completed';
      run = await transition('settle', { stepId, responseId: provider.id, actualMicros: providerCost(provider), usage: provider.usage, state,
        operations: state === 'awaiting_apply' ? interpreted.operations : [], continuation: [...input, ...provider.output, ...interpreted.toolResults],
        message: provider.status !== 'completed' ? 'Astra reached this step’s token allowance. Applied work has been kept.' : interpreted.message });
      emit({ type: 'run', run: publicRun(run) });
    } catch {
      run = await transition('settle', { stepId, state: 'failed', message: 'Astra could not finish this request. Its reserved allowance is held because usage may have occurred. The request will not be retried automatically.' });
      emit({ type: 'run', run: publicRun(run) });
    } finally {
      clearTimeout(timeout); clearInterval(heartbeat); response.off('close', disconnected); response.end();
    }
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The builder request could not be completed.';
    if (streaming) { emit({ type: 'error', message }); response.end(); return; }
    return response.status(message === 'Authentication required.' ? 401 : 409).json({ error: message });
  }
}
