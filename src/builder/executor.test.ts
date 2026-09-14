import { builderContext, executeOperation, nextPaint, type ExecutionContext } from './executor';
import { capabilityManifest, discoverCapabilities, type Schema } from './capabilityManifest';
import { enableBuilder, getBuilderEnabled, getEditorBridge, registerEditorBridge, showBuilderFocus, subscribeBuilder } from './bridge';
import store from '../store';
import { setWhiteboardData } from '../features/whiteBoard/whiteBoardSlice';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), inspect: vi.fn(), activate: vi.fn(), fill: vi.fn(), key: vi.fn(), pick: vi.fn(), resolve: vi.fn() }));
vi.mock('../services/assetRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'asset').map(item => [item.name, (...args: unknown[]) => mocks.invoke('asset', item.name, args)]));
});
vi.mock('../services/boardRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'board').map(item => [item.name, (...args: unknown[]) => mocks.invoke('board', item.name, args)]));
});
vi.mock('../services/branchRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'branch').map(item => [item.name, (...args: unknown[]) => mocks.invoke('branch', item.name, args)]));
});
vi.mock('../services/collaboratorRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'collaborator').map(item => [item.name, (...args: unknown[]) => mocks.invoke('collaborator', item.name, args)]));
});
vi.mock('../services/coverageRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'coverage').map(item => [item.name, (...args: unknown[]) => mocks.invoke('coverage', item.name, args)]));
});
vi.mock('../services/fontRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'font').map(item => [item.name, (...args: unknown[]) => mocks.invoke('font', item.name, args)]));
});
vi.mock('../services/platformRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'platform').map(item => [item.name, (...args: unknown[]) => mocks.invoke('platform', item.name, args)]));
});
vi.mock('../services/productRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'product').map(item => [item.name, (...args: unknown[]) => mocks.invoke('product', item.name, args)]));
});
vi.mock('../services/socialRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'social').map(item => [item.name, (...args: unknown[]) => mocks.invoke('social', item.name, args)]));
});
vi.mock('../services/versionRepository', async () => {
  const { default: catalog } = await import('./generatedCapabilities.json');
  return Object.fromEntries(catalog.capabilities.filter(item => item.domain === 'version').map(item => [item.name, (...args: unknown[]) => mocks.invoke('version', item.name, args)]));
});
vi.mock('./uiCapabilities', () => ({ inspectControls: mocks.inspect, activateControl: mocks.activate, fillControl: mocks.fill, keyControl: mocks.key, pickBuilderFile: mocks.pick, resolveBuilderFile: mocks.resolve }));
const context = (patch: Partial<ExecutionContext> = {}): ExecutionContext => ({ runId: 'run', scope: 'workspace', selection: [], boardId: 'board', signal: new AbortController().signal, handoff: vi.fn().mockResolvedValue(undefined), navigate: vi.fn().mockResolvedValue(undefined), ...patch });
const operation = (capability: string, args: unknown[] = []) => ({ id: 'op', capability, args, summary: 'Do the task' });
function example(schema: Schema, definitions: Record<string, Schema>): unknown {
  if (schema.$ref) return example(definitions[schema.$ref.slice('#/definitions/'.length)]!, definitions);
  if ('const' in schema) return schema.const;
  if (schema.anyOf) return example(schema.anyOf[0]!, definitions);
  if (schema.type === 'string') return schema.pattern ? 'file:test' : 'board';
  if (schema.type === 'number') return Math.max(0, schema.minimum ?? 0);
  if (schema.type === 'boolean') return false;
  if (schema.type === 'array') return [];
  if (schema.type === 'object') return Object.fromEntries((schema.required ?? []).map(key => [key, example(schema.properties![key]!, definitions)]));
  return null;
}
beforeEach(() => { vi.clearAllMocks(); mocks.invoke.mockResolvedValue({ completed: true }); mocks.resolve.mockImplementation(value => value); mocks.inspect.mockReturnValue([]); });
it('dispatches every generated repository capability to the same native UI function', async () => {
  const handoff = vi.fn().mockResolvedValue(undefined);
  for (const capability of capabilityManifest.filter(item => !['canvas', 'editor', 'ui', 'workspace'].includes(item.domain))) {
    const definitions = discoverCapabilities(capability.domain).definitions;
    const args = capability.parameters.filter(parameter => !parameter.optional).map(parameter => example(parameter.schema, definitions));
    await executeOperation(operation(capability.id, args), context({ handoff }));
    expect(mocks.invoke).toHaveBeenLastCalledWith(capability.domain, capability.name, args);
  }
  expect(mocks.invoke.mock.calls.length).toBeGreaterThan(130); expect(handoff).toHaveBeenCalled();
  mocks.invoke.mockResolvedValueOnce(undefined);
  expect(await executeOperation(operation('board.listBoards'), context())).toEqual({ completed: true });
});
it('enforces scope and cancellation before reaching native services', async () => {
  const restricted = context({ scope: 'board' });
  for (const [capability, args] of [['workspace.open', ['other']], ['social.getProfile', []], ['platform.loadOperations', []], ['board.getBoard', ['other']]] as Array<[string, unknown[]]>) await expect(executeOperation(operation(capability, args), restricted)).rejects.toThrow('scope');
  await expect(executeOperation(operation('product.markNotificationRead', []), restricted)).rejects.toThrow('workspace-wide');
  await expect(executeOperation(operation('board.deleteBoard', ['board']), context({ scope: 'selection' }))).rejects.toThrow('selected');
  await expect(executeOperation(operation('ui.activate', ['1']), context({ scope: 'selection' }))).rejects.toThrow('typed');
  const abort = new AbortController(); abort.abort(); await expect(executeOperation(operation('board.listBoards'), context({ signal: abort.signal }))).rejects.toThrow();
  const afterApproval = new AbortController();
  await expect(executeOperation(operation('board.deleteBoard', ['board']), context({ signal: afterApproval.signal, handoff: async () => { afterApproval.abort(); } }))).rejects.toThrow();
  expect(await executeOperation(operation('board.getBoard', ['board']), restricted)).toEqual({ completed: true });
});
it('keeps the editor bridge fresh and routes all editor commands without new implementations', async () => {
  const execute = vi.fn().mockResolvedValue({ applied: true });
  const stop = vi.fn();
  const bridge = { boardId: 'board', roomId: 'room', execute, stop, inspect: () => ({ title: 'Board' }) };
  const dispose = registerEditorBridge(bridge);
  expect(getEditorBridge()).toBe(bridge);
  for (const capability of capabilityManifest.filter(item => item.domain === 'editor')) {
    const definitions = discoverCapabilities('editor').definitions;
    const args = capability.parameters.filter(parameter => !parameter.optional).map(parameter => example(parameter.schema, definitions));
    const op = operation(capability.id, args);
    await executeOperation(op, context()); expect(execute).toHaveBeenLastCalledWith(op, 'run', 'workspace', []);
  }
  await executeOperation(operation('canvas.check'), context());
  expect(builderContext()).toContain('Board');
  const replacement = registerEditorBridge({ ...bridge, boardId: 'other' }); dispose();
  expect(getEditorBridge()?.boardId).toBe('other');
  await expect(executeOperation(operation('canvas.check'), context())).rejects.toThrow('connected');
  replacement(); expect(getEditorBridge()).toBeNull();
  await expect(executeOperation(operation('canvas.check'), context())).rejects.toThrow('connected');
  expect(builderContext()).toContain('workspace');
});
it('forwards only typed UI capabilities and announces focus independently of the human cursor', async () => {
  await executeOperation(operation('ui.inspect'), context()); expect(mocks.inspect).toHaveBeenCalled();
  await executeOperation(operation('ui.activate', ['handle']), context()); expect(mocks.activate).toHaveBeenCalled();
  await executeOperation(operation('ui.fill', ['handle', 'value']), context()); expect(mocks.fill).toHaveBeenCalledWith('handle', 'value');
  await executeOperation(operation('ui.key', ['handle', 'Enter', { shift: false, alt: false, meta: false }]), context()); expect(mocks.key).toHaveBeenCalled();
  await executeOperation(operation('ui.pickFile', ['image/*']), context()); expect(mocks.pick).toHaveBeenCalled();
  const listener = vi.fn(); window.addEventListener('kumo:builder-focus', listener); showBuilderFocus(null); expect(listener).toHaveBeenCalled(); window.removeEventListener('kumo:builder-focus', listener);
  const changed = vi.fn(); const unsubscribe = subscribeBuilder(changed); enableBuilder(true); expect(getBuilderEnabled()).toBe(true); expect(changed).toHaveBeenCalledOnce(); unsubscribe(); enableBuilder(false);
});
it('navigates through authorized board loading and waits for the new room', async () => {
  vi.useFakeTimers();
  mocks.invoke.mockResolvedValue({ id: 'next', roomId: 'room-next', role: 'owner' });
  const ctx = context();
  const pending = executeOperation(operation('workspace.open', ['next']), ctx);
  await vi.advanceTimersByTimeAsync(1);
  const dispose = registerEditorBridge({ boardId: 'next', roomId: 'room-next', execute: vi.fn(), inspect: vi.fn(), stop: vi.fn() });
  await vi.advanceTimersByTimeAsync(100); expect(await pending).toEqual({ opened: 'next' }); expect(ctx.navigate).toHaveBeenCalledWith('next', 'room-next');
  dispose();
  expect(await executeOperation(operation('workspace.open', ['']), ctx)).toEqual({ opened: '' });
  expect(store.getState().whiteBoard.id).toBeNull();
  const timeout = executeOperation(operation('workspace.open', ['next']), ctx); const assertion = expect(timeout).rejects.toThrow('timed out'); await vi.advanceTimersByTimeAsync(21000); await assertion;
  const paint = nextPaint(); await vi.advanceTimersByTimeAsync(50); await paint;
  store.dispatch(setWhiteboardData({ id: 'board' })); expect(builderContext()).toContain('board');
  vi.useRealTimers();
});

it('gives the model the actual canvas size so fitting accounts for sidebars', () => {
  const canvas = document.createElement('div'); canvas.dataset.testid = 'editor-canvas'; document.body.append(canvas);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ width: 620, height: 900 } as DOMRect);
  expect(JSON.parse(builderContext()).canvasSize).toEqual({ width: 620, height: 900 });
  canvas.remove();
});
