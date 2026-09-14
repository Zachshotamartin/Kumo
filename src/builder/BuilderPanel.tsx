import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import store, { type RootState } from '../store';
import { shapeBounds } from '../editor/geometry';
import { setViewport } from '../features/editor/editorSlice';
import { getEditorBridge, showBuilderFocus, type BuilderFocus } from './bridge';
import { builderRequest, builderStatus, builderStep, builderUsage, createBuilderRun, summarizeResult, type BuilderSession, type BuilderUsage } from './client';
import { builderContext, executeOperation, nextPaint, type ExecutionContext } from './executor';
import { clearBuilderFiles } from './uiCapabilities';
import { EFFORTS, terminalRun, validEffort, type BuilderRun, type Effort } from './protocol';
import { readBuilderRecovery, writeBuilderRecovery } from './recovery';
import styles from './BuilderPanel.module.css';

const stateLabels: Record<BuilderRun['state'], string> = { preparing: 'Preparing', awaiting_model: 'Building', awaiting_apply: 'Building', checking: 'Checking', completed: 'Completed', stopped: 'Stopped', failed: 'Failed', budget_exhausted: 'Budget reached', interrupted: 'Interrupted' };
const savedEffort = (): Effort => { try { const value = localStorage.getItem('kumo:builder-effort'); return validEffort(value) ? value : 'low'; } catch { return 'low'; } };
interface HandoffState { message: string; element?: HTMLElement; resolve: () => void; reject: () => void }

export default function BuilderPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selected = useSelector((state: RootState) => state.selected.selectedShapes);
  const viewport = useSelector((state: RootState) => state.editor.viewport);
  const [prompt, setPrompt] = useState('');
  const [effort, setEffort] = useState<Effort>(savedEffort);
  const [preferredScope, setScope] = useState(board.id ? selected.length ? 'selection' : 'board' : 'workspace');
  const scope = !board.id ? 'workspace' : preferredScope === 'selection' && !selected.length ? 'board' : preferredScope;
  const [allowance, setAllowance] = useState<{ enabled: boolean; remainingMicros: number; operator?: boolean } | null>(null);
  const [usage, setUsage] = useState<BuilderUsage | null>(null);
  const [run, setRun] = useState<BuilderRun | null>(null);
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<HandoffState | null>(null);
  const [focus, setFocus] = useState<BuilderFocus | null>(null);
  const [follow, setFollow] = useState(false);
  const [recovery] = useState(readBuilderRecovery);
  const controller = useRef<AbortController | null>(null);
  const session = useRef<BuilderSession | null>(recovery?.session ?? null);
  const expectedBoard = useRef(board.id);
  const expectedRoom = useRef(board.roomId);
  const navigation = useRef(false);
  const lastContext = useRef<ExecutionContext | null>(null);
  const handoffRef = useRef<HandoffState | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort(); getEditorBridge()?.stop(); showBuilderFocus(null);
    handoffRef.current?.reject(); handoffRef.current = null; setHandoff(null);
    if (session.current) void builderRequest(session.current, 'update', { state: 'stopped' }).then(result => setRun(result.run)).catch(() => setError('The stop request could not reach the server. The local executor is stopped.'));
    setBusy(false);
  }, []);
  useEffect(() => {
    let active = true;
    void builderStatus().then(status => { if (active) setAllowance(status); }).catch(reason => { if (active) setError(reason.message); });
    if (recovery) void builderRequest(recovery.session, 'get').then(result => { if (active) setRun(result.run); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; controller.current?.abort(); getEditorBridge()?.stop(); handoffRef.current?.reject(); clearBuilderFiles(); writeBuilderRecovery(null); };
  }, [recovery]);
  useEffect(() => {
    if (busy && !navigation.current && (board.id !== expectedBoard.current || board.roomId !== expectedRoom.current)) stop();
  }, [board.id, board.roomId, busy, stop]);
  useEffect(() => {
    const offline = () => stop();
    const unload = () => { controller.current?.abort(); getEditorBridge()?.stop(); };
    window.addEventListener('offline', offline); window.addEventListener('pagehide', unload);
    return () => { window.removeEventListener('offline', offline); window.removeEventListener('pagehide', unload); };
  }, [stop]);
  useEffect(() => {
    const listener = (event: Event) => setFocus((event as CustomEvent<BuilderFocus | null>).detail);
    const manual = (event: Event) => { if (event.isTrusted && !(event.target instanceof Element && event.target.closest('[data-builder]'))) setFollow(false); };
    window.addEventListener('kumo:builder-focus', listener); window.addEventListener('wheel', manual); window.addEventListener('pointerdown', manual);
    return () => { window.removeEventListener('kumo:builder-focus', listener); window.removeEventListener('wheel', manual); window.removeEventListener('pointerdown', manual); };
  }, []);
  useEffect(() => {
    if (!follow || !focus?.world) return;
    const canvas = document.querySelector('[data-testid="editor-canvas"]')?.getBoundingClientRect();
    if (canvas) store.dispatch(setViewport({ x: focus.x - canvas.width / 2 / viewport.zoom, y: focus.y - canvas.height / 2 / viewport.zoom, zoom: viewport.zoom }));
  }, [focus, follow, viewport.zoom]);

  const requestHandoff = (message: string, element?: HTMLElement) => new Promise<void>((resolve, reject) => {
    const value = { message, element, resolve, reject: () => reject(new Error('Stopped while waiting for user input.')) };
    handoffRef.current = value; setHandoff(value);
  });
  const drive = async (current: BuilderRun, context: ExecutionContext, activeSession: BuilderSession) => {
    let next = current;
    while (!terminalRun(next.state)) {
      context.signal.throwIfAborted();
      if (next.state === 'awaiting_apply') {
        for (const operation of next.pending) {
          context.signal.throwIfAborted();
          setProgress(operation.summary);
          const started = await builderRequest(activeSession, 'start', { operationId: operation.id });
          next = started.run;
          let result: unknown = started.operation?.result;
          if (started.operation?.status !== 'finished') {
            try { result = await executeOperation(operation, context); }
            catch (reason) { result = { error: reason instanceof Error ? reason.message : 'The action could not be completed.' }; }
            // A stop prevents later mutations, while acknowledging a completed
            // in-flight effect remains a separate reconciliation concern.
            const acknowledged = await builderRequest(activeSession, 'ack', { operationId: operation.id, result: summarizeResult(result) });
            next = acknowledged.run;
          }
          setLog(items => [...items, `${operation.summary}${result && typeof result === 'object' && 'error' in result ? ` — ${String(result.error)}` : ''}`].slice(-100));
          await nextPaint();
        }
      } else next = await builderStep(activeSession, builderContext(), context.signal, setProgress);
      setRun(next);
    }
    setProgress(next.message || stateLabels[next.state]);
    const status = await builderStatus(); setAllowance(status);
  };
  const start = async () => {
    setError(''); setLog([]); setBusy(true); setProgress('Preparing');
    const activeSession = { runId: crypto.randomUUID(), lease: crypto.randomUUID() };
    session.current = activeSession;
    const abort = new AbortController(); controller.current = abort;
    expectedBoard.current = board.id; expectedRoom.current = board.roomId;
    const context: ExecutionContext = { runId: activeSession.runId, scope, selection: [...selected], boardId: board.id, signal: abort.signal, handoff: requestHandoff,
      navigate: async (id, roomId) => {
        navigation.current = true;
        try { await builderRequest(activeSession, 'navigate', { boardId: id, roomId }); context.boardId = id || null; expectedBoard.current = id || null; expectedRoom.current = roomId; writeBuilderRecovery({ session: activeSession, scope, selection: context.selection, boardId: id || null, roomId }); }
        finally { navigation.current = false; }
      },
    };
    lastContext.current = context;
    writeBuilderRecovery({ session: activeSession, scope, selection: [...selected], boardId: board.id, roomId: board.roomId });
    try {
      const created = await createBuilderRun(activeSession, prompt, effort, scope, board.id, board.roomId, selected);
      setRun(created.run); await drive(created.run, context, activeSession);
    } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'The builder could not complete the run.'); }
    finally { setBusy(false); getEditorBridge()?.stop(); showBuilderFocus(null); }
  };
  const resume = async () => {
    const saved = readBuilderRecovery();
    if (!saved || saved.boardId !== board.id || saved.roomId !== board.roomId) { setError('Open the original board and branch before resuming this run.'); return; }
    setError(''); setBusy(true);
    const abort = new AbortController(); controller.current = abort; session.current = saved.session;
    expectedBoard.current = board.id; expectedRoom.current = board.roomId;
    const context: ExecutionContext = { runId: saved.session.runId, scope: saved.scope, selection: saved.selection, boardId: board.id, signal: abort.signal, handoff: requestHandoff,
      navigate: async (id, roomId) => { await builderRequest(saved.session, 'navigate', { boardId: id, roomId }); context.boardId = id || null; expectedBoard.current = id || null; expectedRoom.current = roomId; writeBuilderRecovery({ ...saved, boardId: id || null, roomId }); },
    };
    lastContext.current = context;
    try { const resumed = await builderRequest(saved.session, 'resume'); setRun(resumed.run); await drive(resumed.run, context, saved.session); }
    catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'The run could not resume.'); }
    finally { setBusy(false); getEditorBridge()?.stop(); showBuilderFocus(null); }
  };
  const changeEffort = async (next: Effort) => {
    setEffort(next); try { localStorage.setItem('kumo:builder-effort', next); } catch { /* Preference remains available in this tab. */ }
    if (busy && session.current) {
      try { await builderRequest(session.current, 'update', { effort: next }); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Effort could not be updated.'); }
    }
  };
  const undo = async () => {
    if (!lastContext.current || !run) return;
    try { await getEditorBridge()?.execute({ id: crypto.randomUUID(), capability: 'canvas.undoRun', args: [], summary: 'Undo Astra changes' }, run.id, lastContext.current.scope, lastContext.current.selection); setProgress('Undid unchanged Astra document edits. Later edits were preserved.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not undo this run.'); }
  };
  const canvas = focus?.world ? document.querySelector('[data-testid="editor-canvas"]')?.getBoundingClientRect() : null;
  const cursorX = focus?.world ? (canvas?.left ?? 0) + (focus.x - viewport.x) * viewport.zoom : focus?.x;
  const cursorY = focus?.world ? (canvas?.top ?? 0) + (focus.y - viewport.y) * viewport.zoom : focus?.y;
  return <>
    {busy && focus?.world && focus.shapeIds.map(id => {
      const shape = board.shapes.find(candidate => candidate.id === id);
      if (!shape) return null;
      const bounds = shapeBounds(shape);
      return <div key={id} className={styles.highlight} style={{ left: (canvas?.left ?? 0) + (bounds.x - viewport.x) * viewport.zoom, top: (canvas?.top ?? 0) + (bounds.y - viewport.y) * viewport.zoom, width: bounds.width * viewport.zoom, height: bounds.height * viewport.zoom }} aria-hidden="true" />;
    })}
    {busy && focus && <div className={styles.cursor} style={{ left: cursorX, top: cursorY }} aria-hidden="true"><svg width="18" height="24" viewBox="0 0 18 24"><path d="M1 1L17 15L10 16L6 23Z" fill="currentColor" /></svg><span>Astra · {focus.label}</span></div>}
    {visible && <aside className={styles.panel} data-builder="" aria-label="Astra builder">
      <div className={styles.header}><strong>Astra</strong><button type="button" onClick={onClose} aria-label="Minimize Astra">−</button></div>
      <div className={styles.body}>
        <p className={styles.muted}>Build live in Kumo. Relevant board content and your instructions are sent to OpenAI.</p>
        <label>What should Astra do?<textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={8000} disabled={busy} placeholder="Build a sign-in screen in this frame…" /></label>
        <label>Scope<select value={scope} onChange={event => setScope(event.target.value)} disabled={busy}>
          {board.id && selected.length > 0 && <option value="selection">Selection</option>}{board.id && <option value="board">Current board</option>}<option value="workspace">Workspace task</option>
        </select></label>
        <label>Reasoning effort<select value={effort} onChange={event => void changeEffort(event.target.value as Effort)}>{EFFORTS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        {busy && <p className={styles.muted}>Effort changes apply to the next Astra request.</p>}
        <p className={styles.muted}>{allowance ? `$${(allowance.remainingMicros / 1000000).toFixed(2)} allowance remaining` : 'Checking allowance…'}{run ? ` · $${(run.spent_micros / 1000000).toFixed(3)} used this run` : ''}</p>
        {allowance && !allowance.enabled && <p className={styles.notice}>Hosted Astra is not enabled yet. The administrator needs to configure its server key and budget.</p>}
        {handoff && <div className={styles.notice}><p>{handoff.message}</p><div className={styles.row}>{handoff.element && <button type="button" onClick={() => { handoff.element?.scrollIntoView({ block: 'center' }); handoff.element?.focus(); if (handoff.element?.matches('input[type="file"]')) handoff.element.click(); }}>Show control</button>}<button type="button" onClick={() => { handoff.resolve(); handoffRef.current = null; setHandoff(null); }}>Continue</button><button type="button" onClick={stop}>Stop</button></div></div>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {allowance?.operator && <button type="button" onClick={() => { void builderUsage().then(setUsage).catch(reason => setError(reason.message)); }}>Operator usage</button>}
        {usage && <div className={styles.notice}><p>Hosted Astra: {usage.enabled ? 'enabled' : 'disabled'}. Daily cap: ${((usage.caps.day ?? 0) / 1000000).toFixed(2)}.</p><p>{usage.reservations.length} reserved or uncertain requests. Uncertain requests keep their allowance until reconciled.</p><ul>{usage.runs.map(item => <li key={item.id}>{item.user_id} · {item.state} · ${(item.spent_micros / 1000000).toFixed(3)}</li>)}</ul></div>}
        {log.length > 0 && <ol className={styles.log}>{log.map((item, index) => <li key={index}>{item}</li>)}</ol>}
      </div>
      <div className={styles.footer}>
        <div className={styles.row}><button type="button" onClick={() => void start()} disabled={busy || !prompt.trim() || !allowance?.enabled}>Run</button><button type="button" onClick={stop} disabled={!busy}>Stop</button>{run && !busy && !['completed', 'failed', 'budget_exhausted'].includes(run.state) && <button type="button" onClick={() => void resume()}>Resume</button>}{run && !busy && board.id && <button type="button" onClick={() => void undo()}>Undo run edits</button>}</div>
        <label className={styles.row}><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} />Follow Astra</label>
        <p role="status">{busy ? progress : run ? `${stateLabels[run.state]}${progress ? ` · ${progress}` : ''}` : 'Ready'}</p>
      </div>
    </aside>}
    {!visible && busy && <button data-builder="" className={styles.launcher} type="button" onClick={stop} style={{ top: 114 }}>Stop Astra</button>}
  </>;
}
