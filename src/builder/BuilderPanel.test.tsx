import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import BuilderPanel from './BuilderPanel';
import store from '../store';
import { setWhiteboardData } from '../features/whiteBoard/whiteBoardSlice';
import { setSelectedShapes } from '../features/selected/selectedSlice';
import { registerEditorBridge, showBuilderFocus } from './bridge';
import type { BuilderRun } from './protocol';
import { stopBuilder } from './uiState';
import { writeBuilderRecovery } from './recovery';
const mocks = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn(), step: vi.fn(), create: vi.fn(), execute: vi.fn(), clear: vi.fn(), usage: vi.fn() }));
vi.mock('./client', async original => ({ ...await original<typeof import('./client')>(), builderStatus: mocks.status, builderRequest: mocks.request, builderStep: mocks.step, builderUsage: mocks.usage, createBuilderRun: mocks.create }));
vi.mock('./executor', () => ({ builderContext: () => '{}', executeOperation: mocks.execute, nextPaint: () => Promise.resolve() }));
vi.mock('./uiCapabilities', () => ({ clearBuilderFiles: mocks.clear }));
const run = (patch: Partial<BuilderRun> = {}): BuilderRun => ({ id: 'run', board_id: 'board', state: 'preparing', effort: 'low', steps: 0, spent_micros: 0, pending: [], message: '', ...patch });
const pending = () => run({ state: 'awaiting_apply', pending: [{ id: 'op', capability: 'canvas.check', args: [], summary: 'Check the layout' }] });
const renderPanel = (visible = true) => { const result = render(<Provider store={store}><BuilderPanel visible={visible} onClose={vi.fn()} /></Provider>); if (visible) fireEvent.click(screen.getByText('AI controls and usage')); return result; };
const start = async () => { fireEvent.change(screen.getByLabelText('Message AI'), { target: { value: 'Build a card' } }); await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Send message' })); };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  store.dispatch(setWhiteboardData({ id: 'board', roomId: 'room', role: 'owner', shapes: [] })); store.dispatch(setSelectedShapes([]));
  mocks.status.mockResolvedValue({ enabled: true, remainingMicros: 1000000 }); mocks.create.mockResolvedValue({ run: run() });
  mocks.step.mockImplementation(async (_session, _context, _signal, progress) => { progress('AI · low effort'); return pending(); });
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
  renderPanel(); expect(screen.getByLabelText('Scope')).toHaveValue('workspace'); await screen.findByText(/AI is currently unavailable/);
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled(); expect(mocks.create).not.toHaveBeenCalled();
});
it('falls back to board scope when the previous selection is cleared', async () => {
  store.dispatch(setSelectedShapes(['one'])); renderPanel();
  expect(screen.getByLabelText('Scope')).toHaveValue('selection');
  act(() => store.dispatch(setSelectedShapes([])));
  expect(screen.getByLabelText('Scope')).toHaveValue('board');
  await start(); await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.anything(), 'Build a card', 'low', 'board', 'board', 'room', [], []));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
});
it('persists supported efforts and applies live changes on the next server request', async () => {
  localStorage.setItem('kumo:builder-effort', 'high');
  let finish!: (value: unknown) => void; mocks.execute.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  renderPanel(); expect(screen.getByLabelText('Reasoning effort')).toHaveValue('high'); await start(); await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Reasoning effort'), { target: { value: 'max' } });
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(expect.anything(), 'update', { effort: 'max' })); expect(localStorage.getItem('kumo:builder-effort')).toBe('max');
  expect(screen.getByText(/next AI request/)).toBeInTheDocument();
  await act(async () => finish({ applied: true }));
});
it('shows user handoffs and an independent cursor, supports following and minimization', async () => {
  const target = document.createElement('input'); target.type = 'file'; document.body.append(target); target.scrollIntoView = vi.fn(); target.click = vi.fn();
  const canvas = document.createElement('div'); canvas.dataset.testid = 'editor-canvas'; document.body.append(canvas);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 500, height: 300 } as DOMRect);
  mocks.execute.mockImplementation(async (_operation, context) => { showBuilderFocus({ x: 300, y: 200, world: true, shapeIds: [], label: 'Drawing card' }); await context.handoff('Choose a file', target); return { applied: true }; });
  const rendered = renderPanel(); await start(); await screen.findByText('Choose a file');
  expect(screen.getByText('AI · Drawing card')).toBeInTheDocument(); fireEvent.click(screen.getByLabelText('Follow AI cursor'));
  await waitFor(() => expect(store.getState().editor.viewport.x).toBe(50));
  fireEvent.click(screen.getByRole('button', { name: 'Show control' })); expect(target.click).toHaveBeenCalled();
  act(() => showBuilderFocus({ x: 40, y: 50, world: false, shapeIds: [], label: 'A control' })); expect(screen.getByText('AI · A control')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
  rendered.rerender(<Provider store={store}><BuilderPanel visible={false} onClose={vi.fn()} /></Provider>); expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  target.remove(); canvas.remove();
});
it('stops queued work and reconciles an effect that completed while stopping', async () => {
  let finish!: (value: unknown) => void; mocks.execute.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const rendered = renderPanel(); await start(); await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
  rendered.rerender(<Provider store={store}><BuilderPanel visible={false} onClose={vi.fn()} /></Provider>);
  act(stopBuilder);
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
  fireEvent.click(screen.getByLabelText('Follow AI cursor'));
  const manual = listener.mock.calls.find(([name]) => name === 'wheel')![1] as (event: Event) => void;
  act(() => manual({ isTrusted: true, target: screen.getByRole('complementary') } as unknown as Event)); expect(screen.getByLabelText('Follow AI cursor')).toBeChecked();
  act(() => manual({ isTrusted: true, target: document.body } as unknown as Event)); expect(screen.getByLabelText('Follow AI cursor')).not.toBeChecked();
  act(() => manual({ isTrusted: true, target: window } as unknown as Event));
  const canvas = document.createElement('div'); canvas.dataset.testid = 'editor-canvas'; document.body.append(canvas);
  act(() => showBuilderFocus({ x: 20, y: 30, world: true, shapeIds: ['one'], label: 'Target' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed')); target.remove(); canvas.remove();
});
it('shows operator usage without exposing prompts or keys and handles ledger failures', async () => {
  mocks.status.mockResolvedValue({ enabled: true, operator: true, remainingMicros: 1000000 });
  mocks.usage.mockResolvedValueOnce({ enabled: true, caps: { day: 5000000 }, reservations: [], runs: [{ id: 'run', user_id: 'user', state: 'completed', spent_micros: 1000 }] }).mockResolvedValueOnce({ enabled: false, caps: {}, reservations: [{}], runs: [] }).mockRejectedValueOnce(new Error('Ledger unavailable'));
  renderPanel(); fireEvent.click(await screen.findByRole('button', { name: 'Operator usage' })); await screen.findByText(/user · completed/);
  fireEvent.click(screen.getByRole('button', { name: 'Operator usage' })); await screen.findByText(/Hosted AI: disabled/);
  fireEvent.click(screen.getByRole('button', { name: 'Operator usage' })); expect(await screen.findByRole('alert')).toHaveTextContent('Ledger unavailable');
});
it('skips an operation that the server already acknowledged', async () => {
  mocks.request.mockResolvedValueOnce({ run: run({ state: 'completed' }), operation: { status: 'finished', result: { applied: true } } });
  renderPanel(); await start(); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed')); expect(mocks.execute).not.toHaveBeenCalled();
});

it('streams a real conversation before completion and sends follow-up context', async () => {
  let finish!: (value: BuilderRun) => void;
  let delta!: (text: string) => void;
  mocks.step.mockImplementationOnce((_session, _context, _signal, _progress, onText) => { delta = onText; return new Promise(resolve => { finish = resolve; }); });
  const dock = document.createElement('div'); document.body.append(dock);
  const rendered = render(<Provider store={store}><BuilderPanel visible container={dock} onClose={vi.fn()} /></Provider>);
  await start(); await waitFor(() => expect(mocks.step).toHaveBeenCalled());
  act(() => delta('I can help'));
  expect(screen.getByLabelText('AI reply')).toHaveTextContent('I can help');
  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  act(() => delta(' with that.'));
  await act(async () => finish(run({ state: 'completed', message: 'I can help with that.' })));
  expect(screen.getAllByText('I can help with that.')).toHaveLength(1);
  rendered.rerender(<Provider store={store}><BuilderPanel visible={false} container={dock} onClose={vi.fn()} /></Provider>);
  rendered.rerender(<Provider store={store}><BuilderPanel visible container={dock} onClose={vi.fn()} /></Provider>);
  fireEvent.change(screen.getByLabelText('Message AI'), { target: { value: 'Make it blue' } });
  fireEvent.keyDown(screen.getByLabelText('Message AI'), { key: 'Enter', shiftKey: true });
  expect(mocks.create).toHaveBeenCalledOnce();
  fireEvent.keyDown(screen.getByLabelText('Message AI'), { key: 'Enter' });
  await waitFor(() => expect(mocks.create).toHaveBeenLastCalledWith(expect.anything(), 'Make it blue', 'low', 'board', 'board', 'room', [], [{ role: 'user', content: 'Build a card' }, { role: 'assistant', content: 'I can help with that.' }]));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  await waitFor(() => expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument());
  expect(screen.getByText('What would you like to make?')).toBeInTheDocument();
  dock.remove();
});
it('retries a failed connection, enforces allowance, and does not double-send during a request', async () => {
  mocks.status.mockRejectedValueOnce(new Error('Connection failed'));
  renderPanel(); await screen.findByText('Connection failed');
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ready'));
  let finish!: (value: BuilderRun) => void;
  mocks.step.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await start(); await waitFor(() => expect(mocks.step).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Message AI'), { target: { value: 'Next task' } });
  fireEvent.keyDown(screen.getByLabelText('Message AI'), { key: 'Enter' });
  expect(mocks.create).toHaveBeenCalledOnce();
  await act(async () => finish(run({ state: 'completed', message: 'Done' })));
  mocks.status.mockResolvedValueOnce({ enabled: true, remainingMicros: 0 });
  await start(); await waitFor(() => expect(screen.getByText(/allowance has been used/)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Message AI'), { target: { value: 'More' } });
  fireEvent.keyDown(screen.getByLabelText('Message AI'), { key: 'Enter' });
  expect(mocks.create).toHaveBeenCalledTimes(2);
});
it('reports unavailable undo targets and keeps scroll position while reading earlier messages', async () => {
  renderPanel(); await start(); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
  fireEvent.click(screen.getByRole('button', { name: 'Undo run edits' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Open the board');
  const body = screen.getByRole('log').parentElement!;
  Object.defineProperties(body, { scrollHeight: { configurable: true, value: 1200 }, clientHeight: { configurable: true, value: 200 } });
  body.scrollTop = 20; fireEvent.scroll(body);
  await start(); await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
});
it('ends an abandoned request before a new chat or message and preserves recovery on failure', async () => {
  writeBuilderRecovery({ session: { runId: 'run', lease: 'lease' }, scope: 'board', selection: [], boardId: 'board', roomId: 'room' });
  mocks.request.mockResolvedValueOnce({ run: run() });
  renderPanel(); await screen.findByRole('button', { name: 'Resume' });
  mocks.request.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('recovery information have been kept');
  mocks.request.mockRejectedValueOnce(new Error('Offline'));
  await start(); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resume it'));
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument());
  expect(mocks.request).toHaveBeenCalledWith({ runId: 'run', lease: 'lease' }, 'update', { state: 'stopped' });
});

it('allows the server-verified owner to send when the public allowance is exhausted', async () => {
  mocks.status.mockResolvedValue({ enabled: true, remainingMicros: 0, unmetered: true });
  renderPanel(); await screen.findByText('No allowance limit for your account');
  expect(screen.queryByText(/allowance has been used/)).not.toBeInTheDocument();
  await start(); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
  expect(mocks.create).toHaveBeenCalledOnce();
});

it('ignores status results and failures after the sidebar closes', async () => {
  let resolve!: (value: unknown) => void;
  mocks.status.mockImplementationOnce(() => new Promise(finish => { resolve = finish; }));
  const rendered = renderPanel();
  rendered.rerender(<Provider store={store}><BuilderPanel visible={false} onClose={vi.fn()} /></Provider>);
  await act(async () => resolve({ enabled: true, remainingMicros: 1 }));
  let reject!: (reason: Error) => void;
  mocks.status.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  rendered.rerender(<Provider store={store}><BuilderPanel visible onClose={vi.fn()} /></Provider>);
  rendered.unmount(); await act(async () => reject(new Error('Late failure')));
});
it('keeps readable multi-step replies, ignores late text after Stop, and reports refresh errors', async () => {
  mocks.step.mockImplementationOnce(async (_s, _c, _a, _p, delta) => { delta('First.'); return run(); });
  mocks.step.mockResolvedValueOnce(run({ message: 'Second.' }));
  mocks.step.mockImplementationOnce(async (_s, _c, _a, _p, delta) => { delta('Third.'); return run({ state: 'completed' }); });
  mocks.status.mockResolvedValueOnce({ enabled: true, remainingMicros: 1000000 }).mockRejectedValueOnce(new Error('Offline'));
  renderPanel(); await start();
  await waitFor(() => expect(screen.getByLabelText('AI reply')).toHaveTextContent('Third.'));
  expect(screen.getByLabelText('AI reply')).toHaveTextContent('First.Second.Third.');
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh');
  let delta!: (value: string) => void; let finish!: (value: BuilderRun) => void;
  mocks.step.mockImplementationOnce((_s, _c, _a, _p, callback) => { delta = callback; return new Promise(resolve => { finish = resolve; }); });
  await start(); await waitFor(() => expect(mocks.step).toHaveBeenCalledTimes(4));
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  await act(async () => { delta('Late text'); finish(run({ state: 'stopped' })); });
  expect(screen.queryByText('Late text')).not.toBeInTheDocument();
});
it('keeps failed conversations usable, bounds follow-up history, and reports retry failures', async () => {
  mocks.status.mockRejectedValueOnce(new Error('Offline')).mockRejectedValueOnce(new Error('Still offline'));
  renderPanel(); await screen.findByRole('button', { name: 'Retry connection' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Still offline');
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ready'));
  mocks.create.mockRejectedValueOnce(new Error('Could not start'));
  await start(); await screen.findByText('No reply was received.');
  mocks.step.mockResolvedValue(run({ state: 'completed', message: 'Done' }));
  for (let i = 0; i < 8; i++) { await start(); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed')); }
  const history = mocks.create.mock.calls.at(-1)![7]; expect(history).toHaveLength(12);
  expect(history.every((item: { content: string }) => item.content)).toBe(true);
});

it('honors Stop before run creation and ignores late stop replies after another message starts', async () => {
  renderPanel();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ready'));
  fireEvent.change(screen.getByLabelText('Message AI'), { target: { value: 'Build a card' } });
  await act(async () => { fireEvent.keyDown(screen.getByLabelText('Message AI'), { key: 'Enter' }); stopBuilder(); });
  expect(mocks.create).not.toHaveBeenCalled();
  let finish!: (value: BuilderRun) => void;
  mocks.step.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await start(); await waitFor(() => expect(mocks.step).toHaveBeenCalledOnce());
  let stopped!: (value: unknown) => void;
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { stopped = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  await act(async () => finish(run({ state: 'stopped' })));
  mocks.step.mockResolvedValueOnce(run({ state: 'completed', message: 'New result' }));
  await start(); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
  await act(async () => stopped({ run: run({ state: 'stopped' }) }));
  expect(screen.getByRole('status')).toHaveTextContent('Completed');
});
it('groups multiple action receipts and checks the original branch before undo', async () => {
  const operation = pending().pending[0]!;
  mocks.step.mockResolvedValueOnce(run({ state: 'awaiting_apply', pending: [operation, { ...operation, id: 'second', summary: 'Check references' }] }));
  renderPanel(); await start(); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Completed'));
  expect(screen.getByText('2 actions')).toBeInTheDocument();
  const dispose = registerEditorBridge({ boardId: 'board', roomId: 'other-branch', inspect: vi.fn(), execute: vi.fn(), stop: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: 'Undo run edits' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Open the board');
  writeBuilderRecovery(null); fireEvent.click(screen.getByRole('button', { name: 'Undo run edits' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Open the board'); dispose();
});
