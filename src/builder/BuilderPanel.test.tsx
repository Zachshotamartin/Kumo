import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import BuilderPanel from './BuilderPanel';
import store from '../store';
import { setWhiteboardData } from '../features/whiteBoard/whiteBoardSlice';
import { setSelectedShapes } from '../features/selected/selectedSlice';
import { registerEditorBridge, showBuilderFocus } from './bridge';
import type { BuilderRun } from './protocol';
import { writeBuilderRecovery } from './recovery';
const mocks = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn(), step: vi.fn(), create: vi.fn(), execute: vi.fn(), clear: vi.fn(), usage: vi.fn() }));
vi.mock('./client', async original => ({ ...await original<typeof import('./client')>(), builderStatus: mocks.status, builderRequest: mocks.request, builderStep: mocks.step, builderUsage: mocks.usage, createBuilderRun: mocks.create }));
vi.mock('./executor', () => ({ builderContext: () => '{}', executeOperation: mocks.execute, nextPaint: () => Promise.resolve() }));
vi.mock('./uiCapabilities', () => ({ clearBuilderFiles: mocks.clear }));
const run = (patch: Partial<BuilderRun> = {}): BuilderRun => ({ id: 'run', board_id: 'board', state: 'preparing', effort: 'low', steps: 0, spent_micros: 0, pending: [], message: '', ...patch });
const pending = () => run({ state: 'awaiting_apply', pending: [{ id: 'op', capability: 'canvas.check', args: [], summary: 'Check the layout' }] });
const renderPanel = (visible = true) => render(<Provider store={store}><BuilderPanel visible={visible} onClose={vi.fn()} /></Provider>);
const start = async () => { fireEvent.change(screen.getByLabelText('What should Astra do?'), { target: { value: 'Build a card' } }); await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Run' })); };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  store.dispatch(setWhiteboardData({ id: 'board', roomId: 'room', role: 'owner', shapes: [] })); store.dispatch(setSelectedShapes([]));
  mocks.status.mockResolvedValue({ enabled: true, remainingMicros: 1000000 }); mocks.create.mockResolvedValue({ run: run() });
  mocks.step.mockImplementation(async (_session, _context, _signal, progress) => { progress('Astra · low effort'); return pending(); });
  mocks.request.mockImplementation(async (_session, action) => ({ run: action === 'ack' ? run({ state: 'completed', spent_micros: 10000 }) : action === 'update' || action === 'get' ? run({ state: 'stopped' }) : run(), operation: { status: 'started', result: null } }));
  mocks.execute.mockResolvedValue({ applied: true });
});
afterEach(() => { vi.restoreAllMocks(); });

it('defaults scope and effort, runs issued operations, reports spend and allows field-wise undo', async () => {
  store.dispatch(setSelectedShapes(['one']));
  const execute = vi.fn().mockResolvedValue(undefined); const dispose = registerEditorBridge({ boardId: 'board', roomId: 'room', inspect: vi.fn(), execute, stop: vi.fn() });
  renderPanel(); expect(screen.getByLabelText('Scope')).toHaveValue('selection'); expect(screen.getByLabelText('Reasoning effort')).toHaveValue('low');
  await start(); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
  expect(mocks.execute).toHaveBeenCalledOnce(); expect(screen.getByText('Check the layout')).toBeInTheDocument(); expect(screen.getByText(/0.010.*used this run/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo run edits' })); await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ capability: 'canvas.undoRun' }), 'run', 'selection', ['one']));
  dispose();
});
it('keeps hosted inference disabled until server configuration is ready', async () => {
  store.dispatch(setWhiteboardData({ id: null, roomId: null })); mocks.status.mockResolvedValue({ enabled: false, remainingMicros: 0 });
  renderPanel(); expect(screen.getByLabelText('Scope')).toHaveValue('workspace'); await screen.findByText(/Hosted Astra is not enabled/);
  expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled(); expect(mocks.create).not.toHaveBeenCalled();
});
it('falls back to board scope when the previous selection is cleared', async () => {
  store.dispatch(setSelectedShapes(['one'])); renderPanel();
  expect(screen.getByLabelText('Scope')).toHaveValue('selection');
  act(() => store.dispatch(setSelectedShapes([])));
  expect(screen.getByLabelText('Scope')).toHaveValue('board');
  await start(); await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.anything(), 'Build a card', 'low', 'board', 'board', 'room', []));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
});
it('persists supported efforts and applies live changes on the next server request', async () => {
  localStorage.setItem('kumo:builder-effort', 'high');
  let finish!: (value: unknown) => void; mocks.execute.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  renderPanel(); expect(screen.getByLabelText('Reasoning effort')).toHaveValue('high'); await start(); await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Reasoning effort'), { target: { value: 'max' } });
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(expect.anything(), 'update', { effort: 'max' })); expect(localStorage.getItem('kumo:builder-effort')).toBe('max');
  expect(screen.getByText(/next Astra request/)).toBeInTheDocument();
  await act(async () => finish({ applied: true }));
});
it('shows user handoffs and an independent cursor, supports following and minimization', async () => {
  const target = document.createElement('input'); target.type = 'file'; document.body.append(target); target.scrollIntoView = vi.fn(); target.click = vi.fn();
  const canvas = document.createElement('div'); canvas.dataset.testid = 'editor-canvas'; document.body.append(canvas);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 500, height: 300 } as DOMRect);
  mocks.execute.mockImplementation(async (_operation, context) => { showBuilderFocus({ x: 300, y: 200, world: true, shapeIds: [], label: 'Drawing card' }); await context.handoff('Choose a file', target); return { applied: true }; });
  const rendered = renderPanel(); await start(); await screen.findByText('Choose a file');
  expect(screen.getByText('Astra · Drawing card')).toBeInTheDocument(); fireEvent.click(screen.getByLabelText('Follow Astra'));
  await waitFor(() => expect(store.getState().editor.viewport.x).toBe(50));
  fireEvent.click(screen.getByRole('button', { name: 'Show control' })); expect(target.click).toHaveBeenCalled();
  act(() => showBuilderFocus({ x: 40, y: 50, world: false, shapeIds: [], label: 'A control' })); expect(screen.getByText('Astra · A control')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
  rendered.rerender(<Provider store={store}><BuilderPanel visible={false} onClose={vi.fn()} /></Provider>); expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  target.remove(); canvas.remove();
});
it('stops queued work and reconciles an effect that completed while stopping', async () => {
  let finish!: (value: unknown) => void; mocks.execute.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const rendered = renderPanel(); await start(); await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
  rendered.rerender(<Provider store={store}><BuilderPanel visible={false} onClose={vi.fn()} /></Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Stop Astra' }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(expect.anything(), 'update', { state: 'stopped' }));
  await act(async () => finish({ applied: true })); expect(mocks.request).toHaveBeenCalledWith(expect.anything(), 'ack', { operationId: 'op', result: { applied: true } });
  expect(mocks.step).toHaveBeenCalledOnce();
});
it('stops on manual board/branch navigation and network loss', async () => {
  mocks.step.mockImplementation((_session, _context, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')))));
  renderPanel(); await start(); await waitFor(() => expect(mocks.step).toHaveBeenCalled());
  act(() => store.dispatch(setWhiteboardData({ roomId: 'other-room' })));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(expect.anything(), 'update', { state: 'stopped' }));
  act(() => window.dispatchEvent(new Event('offline'))); act(() => window.dispatchEvent(new Event('pagehide')));
});
it('reports failures and per-operation errors honestly without silently continuing a failed request', async () => {
  mocks.create.mockRejectedValueOnce(new Error('No budget')); const rendered = renderPanel(); await start(); expect(await screen.findByRole('alert')).toHaveTextContent('No budget');
  mocks.create.mockRejectedValueOnce('bad'); await start(); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not complete'));
  mocks.execute.mockRejectedValueOnce(new Error('Object changed')); await start(); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed')); expect(screen.getByText(/Check the layout — Object changed/)).toBeInTheDocument();
  mocks.execute.mockRejectedValueOnce('bad'); await start(); await waitFor(() => expect(screen.getByText(/action could not be completed/)).toBeInTheDocument());
  rendered.unmount();
  mocks.status.mockRejectedValueOnce(new Error('Unavailable')); renderPanel(); expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
});
it('resumes a saved executor only on its original board and branch', async () => {
  writeBuilderRecovery({ session: { runId: 'run', lease: 'lease' }, scope: 'board', selection: [], boardId: 'board', roomId: 'room' });
  renderPanel(); await screen.findByRole('button', { name: 'Resume' });
  fireEvent.click(screen.getByRole('button', { name: 'Resume' })); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed')); expect(mocks.request).toHaveBeenCalledWith({ runId: 'run', lease: 'lease' }, 'resume');
});
it('does not silently retry a recovered uncertain request or another board’s run', async () => {
  writeBuilderRecovery({ session: { runId: 'run', lease: 'lease' }, scope: 'board', selection: [], boardId: 'other', roomId: 'room' });
  renderPanel(); await screen.findByRole('button', { name: 'Resume' }); fireEvent.click(screen.getByRole('button', { name: 'Resume' })); expect(await screen.findByRole('alert')).toHaveTextContent('original board');
});
it('survives blocked preference storage and cancels waiting handoffs', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  mocks.execute.mockImplementation(async (_op, context) => { await context.handoff('Confirm an existing action'); return {}; });
  renderPanel(); fireEvent.change(screen.getByLabelText('Reasoning effort'), { target: { value: 'medium' } }); await start(); await screen.findByText('Confirm an existing action');
  fireEvent.click(screen.getAllByRole('button', { name: 'Stop' })[0]!); await waitFor(() => expect(screen.queryByText('Confirm an existing action')).not.toBeInTheDocument());
});

it('supports workspace navigation from both new and resumed runs', async () => {
  mocks.execute.mockImplementation(async (_op, context) => {
    await context.navigate('next', 'next-room'); store.dispatch(setWhiteboardData({ id: 'next', roomId: 'next-room' }));
    await context.navigate('', null); store.dispatch(setWhiteboardData({ id: null, roomId: null }));
    return { opened: true };
  });
  const rendered = renderPanel(); fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'workspace' } }); await start();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
  expect(mocks.request).toHaveBeenCalledWith(expect.anything(), 'navigate', { boardId: 'next', roomId: 'next-room' }); rendered.unmount();
  writeBuilderRecovery({ session: { runId: 'run', lease: 'lease' }, scope: 'workspace', selection: [], boardId: null, roomId: null });
  renderPanel(); await screen.findByRole('button', { name: 'Resume' }); fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
});
it('handles late startup responses, unavailable recovery, and stopping without a session', async () => {
  let rejectStatus!: (reason: unknown) => void;
  mocks.status.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectStatus = reject; }));
  const first = renderPanel(); act(() => window.dispatchEvent(new Event('offline'))); first.unmount(); await act(async () => rejectStatus(new Error('Late error')));
  let resolveStatus!: (value: unknown) => void; let resolveRun!: (value: unknown) => void;
  mocks.status.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = resolve; }));
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { resolveRun = resolve; }));
  writeBuilderRecovery({ session: { runId: 'run', lease: 'lease' }, scope: 'board', selection: [], boardId: 'board', roomId: 'room' });
  const second = renderPanel(); second.unmount(); await act(async () => { resolveStatus({ enabled: true, remainingMicros: 1 }); resolveRun({ run: run() }); });
  writeBuilderRecovery({ session: { runId: 'run', lease: 'lease' }, scope: 'board', selection: [], boardId: 'board', roomId: 'room' });
  mocks.request.mockRejectedValueOnce(new Error('Recovery unavailable')); const third = renderPanel(); expect(await screen.findByRole('alert')).toHaveTextContent('Recovery unavailable'); third.unmount();
  let rejectRun!: (reason: unknown) => void; mocks.request.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRun = reject; }));
  writeBuilderRecovery({ session: { runId: 'run', lease: 'lease' }, scope: 'board', selection: [], boardId: 'board', roomId: 'room' });
  const fourth = renderPanel(); fourth.unmount(); await act(async () => rejectRun(new Error('Late recovery error')));
});
it('reports effort, stop, resume and undo failures without inventing success', async () => {
  let finish!: (value: unknown) => void; mocks.execute.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const execute = vi.fn().mockRejectedValueOnce(new Error('Undo conflict')).mockRejectedValueOnce('bad');
  const dispose = registerEditorBridge({ boardId: 'board', roomId: 'room', inspect: vi.fn(), execute, stop: vi.fn() });
  renderPanel(); await start(); await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
  mocks.request.mockRejectedValueOnce(new Error('Effort unavailable')); fireEvent.change(screen.getByLabelText('Reasoning effort'), { target: { value: 'high' } }); expect(await screen.findByRole('alert')).toHaveTextContent('Effort unavailable');
  mocks.request.mockRejectedValueOnce('bad'); fireEvent.change(screen.getByLabelText('Reasoning effort'), { target: { value: 'low' } }); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Effort could not'));
  mocks.request.mockRejectedValueOnce(new Error('Offline')); fireEvent.click(screen.getByRole('button', { name: 'Stop' })); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('stop request'));
  await act(async () => finish({ applied: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Undo run edits' })); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Undo conflict'));
  fireEvent.click(screen.getByRole('button', { name: 'Undo run edits' })); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not undo')); dispose();
});
it('protects recovered runs when metadata disappears and handles failed/cancelled resumes', async () => {
  const saved = { session: { runId: 'run', lease: 'lease' }, scope: 'board', selection: [], boardId: 'board', roomId: 'room' };
  writeBuilderRecovery(saved); renderPanel(); await screen.findByRole('button', { name: 'Resume' });
  fireEvent.click(screen.getByRole('button', { name: 'Undo run edits' })); expect(mocks.execute).not.toHaveBeenCalled();
  writeBuilderRecovery(null); fireEvent.click(screen.getByRole('button', { name: 'Resume' })); expect(await screen.findByRole('alert')).toHaveTextContent('original board');
  writeBuilderRecovery({ ...saved, roomId: 'other' }); fireEvent.click(screen.getByRole('button', { name: 'Resume' })); expect(screen.getByRole('alert')).toHaveTextContent('original board');
  writeBuilderRecovery(saved); mocks.request.mockRejectedValueOnce(new Error('Uncertain')); fireEvent.click(screen.getByRole('button', { name: 'Resume' })); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Uncertain'));
  mocks.request.mockRejectedValueOnce('bad'); fireEvent.click(screen.getByRole('button', { name: 'Resume' })); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not resume'));
  let reject!: (reason: unknown) => void; mocks.request.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  fireEvent.click(screen.getByRole('button', { name: 'Resume' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Stop' })); await act(async () => reject(new Error('Stopped')));
});
it('renders highlights with and without a canvas and stops following on real user input', async () => {
  const listener = vi.spyOn(window, 'addEventListener');
  store.dispatch(setWhiteboardData({ shapes: [{ id: 'one', type: 'rectangle', x1: 10, y1: 20, x2: 110, y2: 120, width: 100, height: 100, zIndex: 0, level: 0 }] }));
  const target = document.createElement('button'); target.scrollIntoView = vi.fn(); document.body.append(target);
  mocks.execute.mockImplementation(async (_op, context) => { showBuilderFocus({ x: 10, y: 20, world: true, shapeIds: ['one', 'missing'], label: 'Target' }); await context.handoff('Complete target', target); return {}; });
  renderPanel(); await start(); await screen.findByText('Complete target');
  fireEvent.click(screen.getByRole('button', { name: 'Show control' }));
  fireEvent.click(screen.getByLabelText('Follow Astra'));
  const manual = listener.mock.calls.find(([name]) => name === 'wheel')![1] as (event: Event) => void;
  act(() => manual({ isTrusted: true, target: screen.getByRole('complementary') } as unknown as Event)); expect(screen.getByLabelText('Follow Astra')).toBeChecked();
  act(() => manual({ isTrusted: true, target: document.body } as unknown as Event)); expect(screen.getByLabelText('Follow Astra')).not.toBeChecked();
  act(() => manual({ isTrusted: true, target: window } as unknown as Event));
  const canvas = document.createElement('div'); canvas.dataset.testid = 'editor-canvas'; document.body.append(canvas);
  act(() => showBuilderFocus({ x: 20, y: 30, world: true, shapeIds: ['one'], label: 'Target' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed')); target.remove(); canvas.remove();
});
it('shows operator usage without exposing prompts or keys and handles ledger failures', async () => {
  mocks.status.mockResolvedValue({ enabled: true, operator: true, remainingMicros: 1000000 });
  mocks.usage.mockResolvedValueOnce({ enabled: true, caps: { day: 5000000 }, reservations: [], runs: [{ id: 'run', user_id: 'user', state: 'completed', spent_micros: 1000 }] }).mockResolvedValueOnce({ enabled: false, caps: {}, reservations: [{}], runs: [] }).mockRejectedValueOnce(new Error('Ledger unavailable'));
  renderPanel(); fireEvent.click(await screen.findByRole('button', { name: 'Operator usage' })); await screen.findByText(/user · completed/);
  fireEvent.click(screen.getByRole('button', { name: 'Operator usage' })); await screen.findByText(/Hosted Astra: disabled/);
  fireEvent.click(screen.getByRole('button', { name: 'Operator usage' })); expect(await screen.findByRole('alert')).toHaveTextContent('Ledger unavailable');
});
it('skips an operation that the server already acknowledged', async () => {
  mocks.request.mockResolvedValueOnce({ run: run({ state: 'completed' }), operation: { status: 'finished', result: { applied: true } } });
  renderPanel(); await start(); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed')); expect(mocks.execute).not.toHaveBeenCalled();
});
