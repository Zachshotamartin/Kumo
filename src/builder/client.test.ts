import { builderRequest, builderStatus, builderStep, builderUsage, createBuilderRun, summarizeResult } from './client';
import { readBuilderRecovery, writeBuilderRecovery } from './recovery';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), token: vi.fn(), user: { currentUser: null as null | { getIdToken: () => Promise<string> } } }));
vi.mock('../config/firebase', () => ({ auth: mocks.user }));
vi.mock('../services/apiClient', () => ({ authenticatedFetch: mocks.fetch, authenticatedIdToken: () => mocks.user.currentUser?.getIdToken(), clientSessionId: () => 'session' }));
const session = { runId: 'run', lease: 'lease' };
beforeEach(() => { vi.clearAllMocks(); mocks.user.currentUser = { getIdToken: mocks.token }; mocks.token.mockResolvedValue('token'); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('uses authenticated same-origin requests for run control', async () => {
  await builderStatus(); expect(mocks.fetch).toHaveBeenCalledWith('/api/builder');
  await builderUsage(); expect(mocks.fetch).toHaveBeenCalledWith('/api/builder?scope=usage');
  await builderRequest(session, 'get'); expect(mocks.fetch.mock.calls.at(-1)![1].method).toBe('POST');
  await createBuilderRun(session, 'Build', 'max', 'board', 'board', 'room', ['shape']);
  expect(JSON.parse(mocks.fetch.mock.calls.at(-1)![1].body)).toEqual({ ...session, action: 'create', prompt: 'Build', effort: 'max', scope: 'board', boardId: 'board', roomId: 'room', selectionIds: ['shape'], conversation: [] });
});
it('streams progress and the final checkpoint without a 15-second body timeout', async () => {
  const data = ': ping\ndata: {"type":"text_delta","delta":"Hello"}\ndata: {"type":"progress","message":"Working"}\n\ndata: {"type":"other"}\ndata: {"type":"run","run":{"id":"run","state":"completed"}}\n';
  const request = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(data.slice(0, 22))); controller.enqueue(new TextEncoder().encode(data.slice(22))); controller.close(); } }), { headers: { 'content-type': 'text/event-stream' } }));
  vi.stubGlobal('fetch', request); const progress = vi.fn();
  expect(await builderStep(session, '{}', new AbortController().signal, progress)).toEqual({ id: 'run', state: 'completed' });
  expect(progress).toHaveBeenCalledWith('Working'); expect(request.mock.calls[0]![1].headers).toMatchObject({ Authorization: 'Bearer token', 'X-Kumo-Session-Id': 'session' });
  request.mockResolvedValueOnce(new Response('{"run":{"state":"budget_exhausted"}}', { headers: { 'content-type': 'application/json' } }));
  expect(await builderStep(session, '{}', new AbortController().signal, progress)).toEqual({ state: 'budget_exhausted' });
  request.mockResolvedValueOnce(new Response('{"run":{"state":"budget_exhausted"}}'));
  expect(await builderStep(session, '{}', new AbortController().signal, progress)).toEqual({ state: 'budget_exhausted' });
});
it('surfaces auth, API and stream failures without retrying paid requests', async () => {
  mocks.user.currentUser = null; await expect(builderStep(session, '{}', new AbortController().signal, vi.fn())).rejects.toThrow('Authentication');
  mocks.user.currentUser = { getIdToken: mocks.token }; mocks.token.mockResolvedValueOnce(''); await expect(builderStep(session, '{}', new AbortController().signal, vi.fn())).rejects.toThrow('Authentication');
  const request = vi.fn(); vi.stubGlobal('fetch', request);
  const headers = { 'content-type': 'text/event-stream' };
  for (const response of [new Response('{"error":"Not enabled"}', { status: 503 }), new Response(null, { headers }), new Response('data: {"type":"error","message":"Failed"}\n', { headers }), new Response('x'.repeat(250001), { headers }), new Response('', { headers })]) {
    request.mockResolvedValueOnce(response); await expect(builderStep(session, '{}', new AbortController().signal, vi.fn())).rejects.toThrow();
  }
  expect(request).toHaveBeenCalledTimes(5);
});
it('redacts secrets before reporting tool results and bounds large results', () => {
  expect(summarizeResult({ password: 'secret', nested: { apiKey: 'secret', name: 'Safe' } })).toEqual({ password: '[redacted]', nested: { apiKey: '[redacted]', name: 'Safe' } });
  expect(summarizeResult({ text: 'x'.repeat(20000) })).toHaveProperty('truncated', true);
});
it('stores only executor metadata for reload recovery and handles unavailable storage', () => {
  expect(readBuilderRecovery()).toBeNull();
  const recovery = { session, scope: 'board', selection: ['shape'], boardId: 'board', roomId: 'room' };
  writeBuilderRecovery(recovery); expect(readBuilderRecovery()).toEqual(recovery); expect(sessionStorage.getItem('kumo:builder-session')).not.toContain('prompt');
  writeBuilderRecovery(null); expect(readBuilderRecovery()).toBeNull();
  for (const value of ['{', '{}', '{"session":{"runId":"x"}}', '{"session":{"runId":"x","lease":"y"},"scope":"wrong"}', '{"session":{"runId":"x","lease":"y"},"scope":"board"}']) { sessionStorage.setItem('kumo:builder-session', value); expect(readBuilderRecovery()).toBeNull(); }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Disabled'); }); expect(readBuilderRecovery()).toBeNull();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Disabled'); }); expect(() => writeBuilderRecovery(recovery)).not.toThrow();
});

it('delivers text deltas before the run finishes, including split UTF-8 chunks', async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller; } }), { headers: { 'content-type': 'text/event-stream' } })));
  const text = vi.fn();
  const result = builderStep(session, '{}', new AbortController().signal, vi.fn(), text);
  const bytes = new TextEncoder().encode('data: {"type":"text_delta","delta":"Hello…"}\n\n');
  source.enqueue(bytes.slice(0, bytes.length - 5)); source.enqueue(bytes.slice(bytes.length - 5));
  await vi.waitFor(() => expect(text).toHaveBeenCalledWith('Hello…'));
  source.enqueue(new TextEncoder().encode('data: {"type":"text_delta"}\ndata: {"type":"run","run":{"state":"completed"}}\n')); source.close();
  expect(await result).toEqual({ state: 'completed' });
});
