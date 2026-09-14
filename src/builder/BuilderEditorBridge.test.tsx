import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { LiveMap, LiveObject, type LsonObject } from '@liveblocks/client';
import BuilderEditorBridge from './BuilderEditorBridge';
import { getEditorBridge } from './bridge';
import { createAppStore } from '../store';
import { setWhiteboardData } from '../features/whiteBoard/whiteBoardSlice';
import { setCurrentPageId } from '../features/editor/editorSlice';
import { storedShape } from '../collaboration/shapes';
import { normalizeShape } from '../editor/geometry';
import type { Shape } from '../classes/shape';
import type { BuilderOperation } from './protocol';
const mocks = vi.hoisted(() => ({ root: null as unknown, callbacks: [] as Array<(context: unknown, ...args: unknown[]) => unknown>, self: { canWrite: true, presence: { activeShapeIds: [] as string[] } }, others: [] as Array<{ presence: { activeShapeIds: string[]; builder?: { expiresAt: number; shapeIds: string[] } } }>, status: 'connected', presence: vi.fn(), undo: vi.fn(), redo: vi.fn(), clone: vi.fn(), update: vi.fn() }));
vi.mock('@liveblocks/react', () => ({
  useHistory: () => ({ undo: mocks.undo, redo: mocks.redo }), useCanUndo: () => true, useCanRedo: () => true,
  useRoom: () => room,
  useMutation: (callback: (context: unknown, ...args: unknown[]) => unknown) => { mocks.callbacks.push(callback); return (...args: unknown[]) => callback({ storage: mocks.root, self: mocks.self, others: mocks.others }, ...args); },
}));
vi.mock('../services/assetRepository', async importOriginal => ({ ...await importOriginal<typeof import('../services/assetRepository')>(), cloneBoardAssets: mocks.clone }));
vi.mock('../services/boardRepository', () => ({ updateBoardSettings: mocks.update }));
const room = { getStorage: async () => ({ root: mocks.root }), getStatus: () => mocks.status, updatePresence: mocks.presence };
const rect = (id = 'one', patch: Partial<Shape> = {}) => normalizeShape({ id, type: 'rectangle', x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100, level: 0, zIndex: 0, ...patch });
type Storage = LiveObject<{ nodes: LiveMap<string, LiveObject<LsonObject>>; textCharacters: LiveMap<string, LiveObject<LsonObject>>; builderReceipts?: LiveMap<string, string>; backgroundColor: string }>;
let root: Storage;
let store: ReturnType<typeof createAppStore>;
const execute = async (capability: string, args: unknown[] = [], scope = 'board', selection: string[] = [], id: string = crypto.randomUUID()) => {
  let result: unknown;
  const parameters = capability.startsWith('editor.') ? [store.getState().selected.selectedShapes, ...args] : args;
  await act(async () => { result = await getEditorBridge()!.execute({ id, capability, args: parameters, summary: 'Build' }, 'run', scope, selection); });
  return result;
};
function setup(shapes = [rect()]) {
  root = new LiveObject({ nodes: new LiveMap(shapes.map(shape => [shape.id, new LiveObject(storedShape(shape) as LsonObject)])), textCharacters: new LiveMap(), backgroundColor: '#fff' });
  mocks.root = root; store = createAppStore();
  store.dispatch(setWhiteboardData({ id: 'board', roomId: 'room', role: 'owner', shapes }));
  return render(<Provider store={store}><BuilderEditorBridge /></Provider>);
}
beforeEach(() => { vi.clearAllMocks(); mocks.callbacks = []; mocks.self = { canWrite: true, presence: { activeShapeIds: [] } }; mocks.others = []; mocks.status = 'connected'; mocks.clone.mockResolvedValue({}); });

it('inspects, selects and navigates the canvas without requiring edit access', async () => {
  const rendered = setup([rect('one', { pageId: 'page' }), rect('two')]);
  expect(getEditorBridge()!.inspect()).toMatchObject({ boardId: 'board', shapeCount: 2 });
  expect(await execute('canvas.inspect', [[]])).toHaveLength(2);
  expect(await execute('canvas.inspect', [['one']])).toHaveLength(1);
  act(() => store.dispatch(setCurrentPageId('page'))); expect(await execute('canvas.inspect', [[]])).toHaveLength(1);
  await execute('canvas.select', [['one', 'missing']]); expect(store.getState().selected.selectedShapes).toEqual(['one']);
  await execute('canvas.view', [{ x: 10, y: 20, zoom: 2 }]); expect(store.getState().editor.viewport).toEqual({ x: 10, y: 20, zoom: 2 });
  expect(await execute('canvas.check')).toEqual([]);
  act(() => store.dispatch(setWhiteboardData({ role: 'viewer' })));
  await expect(execute('canvas.create', [[rect('new')]])).rejects.toThrow('edit access');
  await execute('editor.copySelected');
  rendered.unmount(); expect(getEditorBridge()).toBeNull();
});
it('records creation and field patches atomically with durable duplicate receipts', async () => {
  setup();
  await execute('canvas.create', [[rect('new')]], 'board', [], 'create');
  expect(root.get('nodes').has('new')).toBe(true);
  expect(JSON.parse(root.get('builderReceipts')!.get('create')!)).toMatchObject({ runId: 'run', operationId: 'create', before: [] });
  expect(await execute('canvas.create', [[rect('new')]], 'board', [], 'create')).toEqual({ applied: true, duplicate: true });
  await execute('canvas.patch', [[{ id: 'one', expected: { backgroundColor: store.getState().whiteBoard.shapes[0]!.backgroundColor ?? null }, patch: { backgroundColor: '#00ff00' } }]]);
  expect(root.get('nodes').get('one')!.get('backgroundColor')).toBe('#00ff00');
  await execute('canvas.undoRun'); expect(root.get('nodes').has('new')).toBe(false);
  expect(root.get('nodes').get('one')!.get('backgroundColor')).toBe(rect().backgroundColor);
});
it('uses native editor transformations and an independent presence cursor', async () => {
  setup(); await execute('canvas.select', [['one']]);
  await execute('editor.nudgeSelected', [10, 20]);
  expect(root.get('nodes').get('one')!.get('x1')).toBe(10);
  expect(mocks.presence.mock.calls.some(([value]) => value.builder?.shapeIds.includes('one'))).toBe(true);
  await execute('editor.undo'); await execute('editor.redo'); expect(mocks.undo).toHaveBeenCalledOnce(); expect(mocks.redo).toHaveBeenCalledOnce();
  getEditorBridge()!.stop(); expect(mocks.presence).toHaveBeenLastCalledWith({ builder: null });
});
it('creates and edits text through the collaborative character store', async () => {
  setup(); await execute('canvas.create', [[rect('text', { type: 'text', text: 'Hi' })]]);
  expect(root.get('textCharacters').size).toBeGreaterThan(0);
  await execute('canvas.patch', [[{ id: 'text', expected: { text: 'Hi' }, patch: { text: 'Hello' } }]]);
  expect(root.get('nodes').get('text')!.get('text')).toBe('Hello');
  await execute('canvas.patch', [[{ id: 'text', expected: { opacity: store.getState().whiteBoard.shapes.find(shape => shape.id === 'text')!.opacity }, patch: { opacity: .5 } }]]);
  await execute('canvas.select', [['text']]);
  await execute('editor.patchSelected', [{ text: undefined }]);
});
it('rejects stale baselines, collisions, lost access and active human/builder claims', async () => {
  setup();
  const create = () => execute('canvas.create', [[rect('new')]]);
  mocks.self.canWrite = false; await expect(create()).rejects.toThrow('connected'); mocks.self.canWrite = true;
  mocks.status = 'disconnected'; await expect(create()).rejects.toThrow('connected'); mocks.status = 'connected';
  await execute('canvas.select', [['one']]);
  root.get('nodes').get('one')!.set('name', 'Other edit'); await expect(execute('editor.nudgeSelected', [1, 1])).rejects.toThrow('collaborator');
  root.get('nodes').get('one')!.delete('name');
  root.get('nodes').delete('one'); await expect(execute('editor.nudgeSelected', [1, 1])).rejects.toThrow('collaborator');
  root.get('nodes').set('one', new LiveObject(storedShape(rect()) as LsonObject));
  root.get('nodes').set('new', new LiveObject(storedShape(rect('new')) as LsonObject)); await expect(create()).rejects.toThrow('already exists'); root.get('nodes').delete('new');
  mocks.self.presence.activeShapeIds = ['one']; await expect(execute('editor.nudgeSelected', [1, 1])).rejects.toThrow('being edited'); mocks.self.presence.activeShapeIds = [];
  mocks.others = [{ presence: { activeShapeIds: ['one'] } }]; await expect(execute('editor.nudgeSelected', [1, 1])).rejects.toThrow('being edited');
  mocks.others = [{ presence: { activeShapeIds: [], builder: { shapeIds: ['one'], expiresAt: Date.now() + 10000 } } }]; await expect(execute('editor.nudgeSelected', [1, 1])).rejects.toThrow('being edited');
  mocks.others[0]!.presence.builder!.expiresAt = 0; await execute('editor.nudgeSelected', [1, 1]);
});
it('bounds creation, enforces selection scope, and validates hierarchy before applying', async () => {
  setup([rect('parent', { type: 'frame' }), rect('child', { parentId: 'parent' }), rect('outside')]);
  await expect(execute('canvas.create', [[rect('new')]], 'selection', ['parent'])).rejects.toThrow('selected container');
  await expect(execute('canvas.create', [[rect('new', { parentId: 'outside' })]], 'selection', ['parent'])).rejects.toThrow('selected container');
  await execute('canvas.create', [[rect('new', { parentId: 'parent' })]], 'selection', ['parent']);
  await execute('canvas.select', [['outside']]); await expect(execute('editor.nudgeSelected', [1, 1], 'selection', ['parent'])).rejects.toThrow('outside');
  await expect(execute('canvas.create', [[rect('same'), rect('same')]])).rejects.toThrow('unique');
  await expect(execute('canvas.create', [[rect('parent')]])).rejects.toThrow('unique');
  await expect(execute('canvas.create', [[rect('orphan', { parentId: 'missing' })]])).rejects.toThrow('references');
  await expect(execute('canvas.create', [[rect('cycle', { parentId: 'cycle' })]])).rejects.toThrow('references');
  const receipt = { runId: 'run', operationId: 'old', before: [], after: Array.from({ length: 100 }, (_, index) => rect(String(index))), timestamp: Date.now() };
  root.get('builderReceipts')!.set('old', JSON.stringify(receipt)); await expect(execute('canvas.create', [[rect('extra')]])).rejects.toThrow('100-object');
});
it('prunes expired/overflow receipts without discarding recent run undo information', async () => {
  setup();
  const receipts = new LiveMap<string, string>(); root.set('builderReceipts', receipts);
  for (let index = 0; index < 513; index++) receipts.set(String(index), JSON.stringify({ runId: 'other', before: [], after: [], timestamp: Date.now() }));
  receipts.set('expired', JSON.stringify({ runId: 'other', before: [], after: [], timestamp: 1 }));
  await execute('canvas.create', [[rect('new')]]); expect(receipts.size).toBe(512); expect(receipts.has('expired')).toBe(false);
});
it('unlocks explicitly and stops a waiting native operation when its executor disappears', async () => {
  const rendered = setup([rect('locked', { locked: true })]);
  await execute('canvas.patch', [[{ id: 'locked', expected: { locked: true }, patch: { locked: false } }]]);
  expect(root.get('nodes').get('locked')!.get('locked')).toBe(false);
  const invoke = getEditorBridge()!.execute;
  const op: BuilderOperation = { id: 'pending', capability: 'editor.paste', args: [[]], summary: 'Paste' };
  await act(async () => { await invoke(op, 'run', 'board', []); });
  rendered.unmount(); expect(getEditorBridge()).toBeNull();
});

it('pins editor commands to their issued selection even when the human selects something else', async () => {
  setup([rect('one'), rect('two')]);
  await execute('canvas.select', [['two']]);
  await act(async () => { await getEditorBridge()!.execute({ id: 'pin', capability: 'editor.nudgeSelected', args: [['one'], 10, 0], summary: 'Move one' }, 'run', 'board', []); });
  expect(root.get('nodes').get('one')!.get('x1')).toBe(10); expect(root.get('nodes').get('two')!.get('x1')).toBe(0);
});
it('records background changes, rejects scope/access violations and undoes only unchanged values', async () => {
  setup();
  const mutationContext = { storage: root, self: mocks.self, others: mocks.others };
  expect(() => mocks.callbacks[0]!(mutationContext, [], [])).toThrow('connected');
  expect(() => mocks.callbacks[1]!(mutationContext, '#000')).toThrow('access');
  await expect(execute('canvas.background', ['#000'], 'selection')).rejects.toThrow('scope');
  mocks.self.canWrite = false; await expect(execute('canvas.background', ['#000'])).rejects.toThrow('access'); mocks.self.canWrite = true;
  await execute('canvas.background', ['#123']); expect(root.get('backgroundColor')).toBe('#123');
  await execute('canvas.undoRun'); expect(root.get('backgroundColor')).toBe('#fff');
  await execute('canvas.background', ['#456']); root.set('backgroundColor', '#789'); await execute('canvas.undoRun'); expect(root.get('backgroundColor')).toBe('#789');
  const receipts = root.get('builderReceipts')!;
  for (let index = 0; index < 513; index++) receipts.set(String(index), JSON.stringify({ runId: 'other', before: [], after: [], timestamp: Date.now() }));
  await execute('canvas.background', ['#abc']); expect(receipts.size).toBe(512);
});
it('rejects work after Stop and guards receipt races inside the storage batch', async () => {
  const rendered = setup();
  mocks.presence.mockImplementationOnce(() => getEditorBridge()!.stop());
  await expect(execute('canvas.create', [[rect('cancelled')]])).rejects.toThrow('connected');
  mocks.presence.mockImplementationOnce(() => getEditorBridge()!.stop());
  await expect(execute('canvas.background', ['#abc'])).rejects.toThrow('access');
  mocks.presence.mockImplementationOnce(() => {
    root.set('builderReceipts', new LiveMap([['race', JSON.stringify({ runId: 'run', before: [], after: [], timestamp: Date.now() })]]));
    root.get('nodes').set('new', new LiveObject(storedShape(rect('new')) as LsonObject));
  });
  await execute('canvas.create', [[rect('new')]], 'board', [], 'race'); expect(root.get('nodes').size).toBe(2);
  mocks.presence.mockImplementationOnce(() => rendered.unmount());
  await expect(execute('canvas.create', [[rect('unmounted')]])).rejects.toThrow('connected');
});
it('does not attach an executor without a board/room and handles empty undo history', async () => {
  const rendered = setup(); await execute('canvas.undoRun');
  act(() => store.dispatch(setWhiteboardData({ id: null }))); expect(getEditorBridge()).toBeNull();
  act(() => store.dispatch(setWhiteboardData({ id: 'board', roomId: null }))); expect(getEditorBridge()).toBeNull();
  rendered.unmount();
});
it('keeps locked objects safe even in higher-level component commands', async () => {
  setup([rect('locked', { locked: true })]); await execute('canvas.select', [['locked']]);
  await expect(execute('editor.createComponentSelected', ['Component'])).rejects.toThrow('Unlock');
});
it('rejects adding or moving content into a locked parent', async () => {
  setup([rect('locked', { type: 'frame', locked: true }), rect('one')]);
  await expect(execute('canvas.create', [[rect('child', { parentId: 'locked' })]])).rejects.toThrow('destination');
  await expect(execute('canvas.patch', [[{ id: 'one', expected: { parentId: null }, patch: { parentId: 'locked' } }]])).rejects.toThrow('destination');
});
