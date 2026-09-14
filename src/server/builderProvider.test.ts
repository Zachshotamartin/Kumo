import { builderConfig, builderInstructions, builderTools, interpretAstra, providerCost, requestAstra, type ProviderResponse } from '../../server/api/_builder';
const complete = (patch: Partial<ProviderResponse> = {}): ProviderResponse => ({ id: 'resp_1', status: 'completed', output: [], usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } }, ...patch });
describe('Astra provider boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('fails closed unless the server key and explicit hosted flag are present', () => {
    vi.stubEnv('KUMO_BUILDER_ENABLED', 'false'); vi.stubEnv('OPENAI_API_KEY', '');
    expect(builderConfig()).toMatchObject({ enabled: false, userCap: 1000000, dayCap: 5000000, monthCap: 25000000 });
    vi.stubEnv('KUMO_BUILDER_ENABLED', 'true'); expect(builderConfig().enabled).toBe(false);
    vi.stubEnv('OPENAI_API_KEY', 'test'); expect(builderConfig().enabled).toBe(true);
    for (const value of ['-1', 'NaN', '1001', '0']) { vi.stubEnv('KUMO_BUILDER_RUN_USD', value); expect(() => builderConfig()).toThrow('budget'); }
  });
  it('accounts for cached input and all output including reasoning, rejects unknown pricing', () => {
    expect(providerCost(complete())).toBe(2000);
    expect(providerCost(complete({ service_tier: 'default', usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 40, cache_write_tokens: 0 } } }))).toBe(1640);
    expect(providerCost(complete({ usage: { input_tokens: 100, output_tokens: 0, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 40 } } }))).toBe(920);
    expect(providerCost(complete({ usage: { input_tokens: 0, output_tokens: 0, input_tokens_details: { cache_write_tokens: 0 } } }))).toBe(0);
    for (const usage of [undefined, { input_tokens: -1, output_tokens: 0 }, { input_tokens: 1, output_tokens: -1 }, { input_tokens: .5, output_tokens: 0 }, { input_tokens: 1, output_tokens: .5 }, { input_tokens: 1, output_tokens: 0, input_tokens_details: { cached_tokens: 2 } }, { input_tokens: 1, output_tokens: 0, input_tokens_details: { cached_tokens: -1 } }, { input_tokens: 1, output_tokens: 0, input_tokens_details: { cached_tokens: .5 } }, { input_tokens: 272001, output_tokens: 0 }]) expect(() => providerCost(complete({ usage }))).toThrow();
    expect(() => providerCost(complete({ service_tier: 'priority' }))).toThrow('tier');
  });
  it('validates a complete batch before issuing any client operation', () => {
    const perform = (actions: unknown[]) => ({ type: 'function_call', name: 'perform', call_id: 'call', arguments: JSON.stringify({ actions }) });
    const action = { capability: 'canvas.select', argsJson: '[[]]', summary: 'Select objects' };
    expect(interpretAstra(complete({ output: [perform([action])] })).operations[0]).toMatchObject({ capability: action.capability, callId: 'call', args: [[]] });
    const invalid = interpretAstra(complete({ output: [perform([action, { ...action, capability: 'arbitrary' }])] }));
    expect(invalid.operations).toEqual([]); expect(invalid.toolResults[0]?.output).toContain('Unknown');
    expect(interpretAstra(complete({ output: [perform(Array.from({ length: 26 }, () => action))] })).operations).toEqual([]);
    expect(interpretAstra(complete({ output: [perform(Array.from({ length: 25 }, () => action)), perform([action])] })).operations).toHaveLength(25);
    expect(interpretAstra(complete({ output: [{ type: 'function_call' }] })).toolResults[0]?.output).toContain('invalid');
    expect(interpretAstra(complete({ output: [{ type: 'function_call', arguments: '{' }] })).toolResults).toHaveLength(1);
  });
  it('discovers domains and returns visible final text, never hidden reasoning', () => {
    const result = interpretAstra(complete({ output: [
      { type: 'reasoning', encrypted_content: 'hidden' }, { type: 'message', content: [{ type: 'output_text', text: 'Done' }, { type: 'other' }, { type: 'output_text' }] }, { type: 'message' },
      { type: 'function_call', name: 'discover', call_id: 'one', arguments: '{"domain":"canvas"}' },
    ] }));
    expect(result.message).toBe('Done'); expect(result.toolResults[0]?.output).toContain('canvas.create');
    expect(builderTools.map(item => item.name)).toEqual(['discover', 'perform']);
    expect(builderInstructions).toContain('untrusted');
  });
  it('streams a single request, preserving complete output and encrypted continuations', async () => {
    const data = [': keepalive\n', 'data: {"type":"response.output_text.delta","delta":"Hello"}\n', 'data: {"type":"response.created"}\n\n', 'data: {"type":"response.output_item.added"}\n', `data: ${JSON.stringify({ type: 'response.completed', response: complete() })}\r\n`, 'data: [DONE]\n'].join('');
    const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(data.slice(0, 31))); controller.enqueue(new TextEncoder().encode(data.slice(31))); controller.close(); } })));
    vi.stubGlobal('fetch', fetchMock);
    const progress = vi.fn();
    expect(await requestAstra([], 'max', 2000, new AbortController().signal, progress)).toEqual(complete());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toMatchObject({ model: 'gpt-6-astra', reasoning: { effort: 'max' }, store: false, include: ['reasoning.encrypted_content'], max_output_tokens: 2000, service_tier: 'default' });
    expect(progress).toHaveBeenCalledTimes(2); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not retry failed, oversized, incomplete or interrupted streams', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const response of [new Response('', { status: 429 }), new Response(null), new Response('data: {"type":"error"}\n'), new Response('data: {"type":"response.failed"}\n'), new Response('data: {"type":"other"}\n'), new Response('x'.repeat(2000001))]) {
      fetchMock.mockResolvedValueOnce(response); await expect(requestAstra([], 'low', 1000, new AbortController().signal, vi.fn())).rejects.toThrow();
    }
    fetchMock.mockResolvedValueOnce(new Response(`data: ${JSON.stringify({ type: 'response.incomplete', response: complete({ status: 'incomplete' }) })}\n`));
    expect((await requestAstra([], 'low', 1000, new AbortController().signal, vi.fn())).status).toBe('incomplete');
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });
  it('records early response IDs and rejects invalid cache-write accounting', async () => {
    const source = `data: ${JSON.stringify({ type: 'response.created', response: complete() })}\ndata: ${JSON.stringify({ type: 'response.completed', response: complete() })}\n`;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(source))));
    const created = vi.fn().mockResolvedValue(undefined);
    await requestAstra([], 'low', 1000, new AbortController().signal, vi.fn(), created); expect(created).toHaveBeenCalledWith('resp_1');
    await requestAstra([], 'low', 1000, new AbortController().signal, vi.fn());
    for (const details of [{ cache_write_tokens: -1 }, { cache_write_tokens: .5 }, { cache_write_tokens: 101 }, { cache_write_tokens: 0, cached_tokens: .5 }, { cache_write_tokens: 0, cached_tokens: -1 }]) expect(() => providerCost(complete({ usage: { input_tokens: 100, output_tokens: 0, input_tokens_details: details } }))).toThrow();
    expect(() => providerCost(complete({ usage: { input_tokens: 272001, output_tokens: 0, input_tokens_details: { cache_write_tokens: 0 } } }))).toThrow();
    const parse = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => { throw 'parse failed'; });
    expect(interpretAstra(complete({ output: [{ type: 'function_call', arguments: '{}' }] })).toolResults[0]?.output).toContain('Invalid tool call'); parse.mockRestore();
  });
});

it('forwards only visible text as it arrives before provider completion', async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller; } }))));
  const delta = vi.fn();
  const result = requestAstra([], 'medium', 1000, new AbortController().signal, vi.fn(), undefined, delta);
  source.enqueue(new TextEncoder().encode('data: {"type":"response.reasoning_text.delta","delta":"private"}\ndata: {"type":"response.output_text.delta","delta":"I can help."}\ndata: {"type":"response.output_text.delta"}\n'));
  await vi.waitFor(() => expect(delta).toHaveBeenCalledExactlyOnceWith('I can help.'));
  source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'response.completed', response: complete() })}\n`)); source.close();
  expect(await result).toEqual(complete());
  vi.unstubAllGlobals();
});
