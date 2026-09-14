import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowCounterClockwise, Plus, Stop, X } from '@phosphor-icons/react';
import { useSelector } from 'react-redux';
import store, { type RootState } from '../store';
import { shapeBounds } from '../editor/geometry';
import { setViewport } from '../features/editor/editorSlice';
import { getEditorBridge, showBuilderFocus, type BuilderFocus } from './bridge';
import { builderRequest, builderStatus, builderStep, builderUsage, createBuilderRun, summarizeResult, type BuilderSession, type BuilderUsage } from './client';
import { builderContext, executeOperation, nextPaint, type ExecutionContext } from './executor';
import { clearBuilderFiles } from './uiCapabilities';
import { EFFORTS, terminalRun, validEffort, type BuilderRun, type ConversationMessage, type Effort } from './protocol';
import { setBuilderBusy } from './uiState';
import { readBuilderRecovery, writeBuilderRecovery } from './recovery';
import styles from './BuilderPanel.module.css';
import ChatText from './ChatText';

const stateLabels: Record<BuilderRun['state'], string> = { preparing: 'Preparing', awaiting_model: 'Building', awaiting_apply: 'Building', checking: 'Checking', completed: 'Completed', stopped: 'Stopped', failed: 'Failed', budget_exhausted: 'Budget reached', interrupted: 'Interrupted' };
const savedEffort = (): Effort => { try { const value = localStorage.getItem('kumo:builder-effort'); return validEffort(value) ? value : 'low'; } catch { return 'low'; } };
interface HandoffState { message: string; element?: HTMLElement; resolve: () => void; reject: () => void }
interface ChatEntry { id: string; role: 'user' | 'assistant'; text: string; actions: string[] }
const effortLabels: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Very high', max: 'Maximum' };

export default function BuilderPanel({ visible, container, onClose }: { visible: boolean; container?: HTMLElement; onClose: () => void }) {
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selected = useSelector((state: RootState) => state.selected.selectedShapes);
  const viewport = useSelector((state: RootState) => state.editor.viewport);
  const [prompt, setPrompt] = useState('');
  const [effort, setEffort] = useState<Effort>(savedEffort);
  const [preferredScope, setScope] = useState(board.id ? selected.length ? 'selection' : 'board' : 'workspace');
  const scope = !board.id ? 'workspace' : preferredScope === 'selection' && !selected.length ? 'board' : preferredScope;
  const [allowance, setAllowance] = useState<{ enabled: boolean; remainingMicros: number; unmetered?: boolean; operator?: boolean } | null>(null);
  const [usage, setUsage] = useState<BuilderUsage | null>(null);
  const [run, setRun] = useState<BuilderRun | null>(null);
  const [progress, setProgress] = useState('');
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const activeReply = useRef('');
  const transcript = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);
  const [error, setError] = useState('');
  const [busy, updateBusy] = useState(false);
  const busyRef = useRef(false);
  const [stopping, setStopping] = useState(false);
  const setBusy = useCallback((value: boolean) => { busyRef.current = value; updateBusy(value); setBuilderBusy(value); }, []);
  const updateReply = (update: (entry: ChatEntry) => ChatEntry) => { const id = activeReply.current; setChat(items => items.map(item => item.id === id ? update(item) : item)); };
  const [handoff, setHandoff] = useState<HandoffState | null>(null);
  const [focus, setFocus] = useState<BuilderFocus | null>(null);
  const [follow, setFollow] = useState(false);
  const [recovery] = useState(readBuilderRecovery);
  const controller = useRef<AbortController | null>(null);
  const session = useRef<BuilderSession | null>(recovery?.session ?? null);
  const expectedBoard = useRef(board.id);
  const expectedRoom = useRef(board.roomId);
  const navigation = useRef(false);
  const handoffRef = useRef<HandoffState | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort(); getEditorBridge()?.stop(); showBuilderFocus(null);
    handoffRef.current?.reject(); handoffRef.current = null; setHandoff(null);
    if (!busyRef.current) return;
    setStopping(true); setProgress('Stopping… Completed changes will be kept.');
    const stoppedSession = session.current;
    if (stoppedSession) void builderRequest(stoppedSession, 'update', { state: 'stopped' }).then(result => { if (session.current === stoppedSession) setRun(result.run); }).catch(() => setError('The stop request could not reach the server. The local executor is stopped.'));
  }, []);
  useEffect(() => {
    let active = true;
    if (recovery) void builderRequest(recovery.session, 'get').then(result => { if (active) setRun(result.run); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; controller.current?.abort(); getEditorBridge()?.stop(); handoffRef.current?.reject(); clearBuilderFiles(); setBuilderBusy(false); };
  }, [recovery]);
  useEffect(() => {
    let active = true;
    if (visible) void builderStatus().then(status => { if (active) setAllowance(status); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [visible]);
  useEffect(() => {
    if (busy && !navigation.current && (board.id !== expectedBoard.current || board.roomId !== expectedRoom.current)) stop();
  }, [board.id, board.roomId, busy, stop]);
  useEffect(() => {
    const offline = () => stop();
    const unload = () => { controller.current?.abort(); getEditorBridge()?.stop(); };
    window.addEventListener('offline', offline); window.addEventListener('pagehide', unload); window.addEventListener('kumo:builder-stop', stop);
    return () => { window.removeEventListener('offline', offline); window.removeEventListener('pagehide', unload); window.removeEventListener('kumo:builder-stop', stop); };
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
  useEffect(() => { const node = transcript.current; if (node && autoScroll.current) node.scrollTop = node.scrollHeight; }, [chat, progress, visible]);

  const requestHandoff = (message: string, element?: HTMLElement) => new Promise<void>((resolve, reject) => {
    const value = { message, element, resolve, reject: () => reject(new Error('Stopped while waiting for user input.')) };
    handoffRef.current = value; setHandoff(value);
  });
  const endPreviousRequest = async () => {
    if (session.current && run && !terminalRun(run.state)) {
      const result = await builderRequest(session.current, 'update', { state: 'stopped' });
      setRun(result.run);
    }
  };
  const newChat = async () => {
    setBusy(true);
    try {
      await endPreviousRequest();
      setChat([]); setPrompt(''); setError(''); setProgress(''); setRun(null);
      session.current = null; writeBuilderRecovery(null);
    } catch { setError('Could not end the previous request. Your conversation and recovery information have been kept. Try again when connected.'); }
    finally { setBusy(false); }
  };
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
          const outcome = `${operation.summary}${result && typeof result === 'object' && 'error' in result ? ` — ${String(result.error)}` : ''}`;
          updateReply(entry => ({ ...entry, actions: [...entry.actions, outcome].slice(-100) }));
          await nextPaint();
        }
      } else {
        let text = '';
        next = await builderStep(activeSession, builderContext(), context.signal, setProgress, delta => {
          if (context.signal.aborted) return;
          const first = !text; text += delta;
          updateReply(entry => ({ ...entry, text: (entry.text + (first && entry.text ? '\n\n' : '') + delta).slice(0, 16000) }));
        });
        const message = next.message;
        if (message && !text) updateReply(entry => ({ ...entry, text: (entry.text + (entry.text ? '\n\n' : '') + message).slice(0, 16000) }));
      }
      setRun(next);
    }
    setProgress(stateLabels[next.state]);
    if (next.state === 'completed') setError('');
    await builderStatus().then(setAllowance).catch(() => setError('Could not refresh the allowance. Reopen AI to check before sending another message.'));
  };
  const start = async () => {
    if (busyRef.current || !prompt.trim() || !allowance?.enabled || (!allowance.unmetered && allowance.remainingMicros <= 0)) return;
    setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try { await endPreviousRequest(); }
    catch { setError('Could not end the previous request. Resume it or try again when connected.'); setBusy(false); return; }
    if (abort.signal.aborted) { setBusy(false); setStopping(false); setProgress('Completed changes were kept.'); return; }
    const question = prompt.trim();
    const conversation: ConversationMessage[] = [];
    let historyLength = 0;
    for (const item of [...chat].reverse()) {
      const content = `${item.text}${item.actions.length ? '\nReported action results:\n' + item.actions.join('\n') : ''}`.slice(0, 8000);
      if (!content) continue;
      if (historyLength + content.length > 24000 || conversation.length >= 12) break;
      conversation.unshift({ role: item.role, content }); historyLength += content.length;
    }
    activeReply.current = crypto.randomUUID();
    setChat(items => [...items, { id: crypto.randomUUID(), role: 'user', text: question, actions: [] }, { id: activeReply.current, role: 'assistant', text: '', actions: [] }]);
    autoScroll.current = true; setPrompt(''); setError(''); setBusy(true); setStopping(false); setRun(null); setProgress('Thinking…');
    const activeSession = { runId: crypto.randomUUID(), lease: crypto.randomUUID() };
    session.current = activeSession;
    expectedBoard.current = board.id; expectedRoom.current = board.roomId;
    const context: ExecutionContext = { runId: activeSession.runId, scope, selection: [...selected], boardId: board.id, signal: abort.signal, handoff: requestHandoff,
      navigate: async (id, roomId) => {
        navigation.current = true;
        try { await builderRequest(activeSession, 'navigate', { boardId: id, roomId }); context.boardId = id || null; expectedBoard.current = id || null; expectedRoom.current = roomId; writeBuilderRecovery({ session: activeSession, scope, selection: context.selection, boardId: id || null, roomId }); }
        finally { navigation.current = false; }
      },
    };
    writeBuilderRecovery({ session: activeSession, scope, selection: [...selected], boardId: board.id, roomId: board.roomId });
    try {
      const created = await createBuilderRun(activeSession, question, effort, scope, board.id, board.roomId, selected, conversation);
      setRun(created.run); await drive(created.run, context, activeSession);
    } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'The builder could not complete the run.'); }
    finally { if (abort.signal.aborted) setProgress('Completed changes were kept.'); setBusy(false); setStopping(false); getEditorBridge()?.stop(); showBuilderFocus(null); }
  };
  const resume = async () => {
    const saved = readBuilderRecovery();
    if (!saved || saved.boardId !== board.id || saved.roomId !== board.roomId) { setError('Open the original board and branch before resuming this run.'); return; }
    setError(''); setBusy(true);
    activeReply.current = crypto.randomUUID();
    setChat(items => [...items, { id: activeReply.current, role: 'assistant', text: 'Resuming the previous request.', actions: [] }]);
    const abort = new AbortController(); controller.current = abort; session.current = saved.session;
    expectedBoard.current = board.id; expectedRoom.current = board.roomId;
    const context: ExecutionContext = { runId: saved.session.runId, scope: saved.scope, selection: saved.selection, boardId: board.id, signal: abort.signal, handoff: requestHandoff,
      navigate: async (id, roomId) => { await builderRequest(saved.session, 'navigate', { boardId: id, roomId }); context.boardId = id || null; expectedBoard.current = id || null; expectedRoom.current = roomId; writeBuilderRecovery({ ...saved, boardId: id || null, roomId }); },
    };
    try { const resumed = await builderRequest(saved.session, 'resume'); setRun(resumed.run); await drive(resumed.run, context, saved.session); }
    catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'The run could not resume.'); }
    finally { if (abort.signal.aborted) setProgress('Completed changes were kept.'); setBusy(false); setStopping(false); getEditorBridge()?.stop(); showBuilderFocus(null); }
  };
  const changeEffort = async (next: Effort) => {
    setEffort(next); try { localStorage.setItem('kumo:builder-effort', next); } catch { /* Preference remains available in this tab. */ }
    if (busy && session.current) {
      try { await builderRequest(session.current, 'update', { effort: next }); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Effort could not be updated.'); }
    }
  };
  const undo = async (target: BuilderRun) => {
    setError('');
    try {
      const bridge = getEditorBridge();
      const context = readBuilderRecovery();
      if (!context || !bridge || bridge.boardId !== context.boardId || bridge.roomId !== context.roomId) throw new Error('Open the board where AI made these edits before undoing them.');
      await bridge.execute({ id: crypto.randomUUID(), capability: 'canvas.undoRun', args: [], summary: 'Undo AI changes' }, target.id, context.scope, context.selection); setProgress('Undid unchanged AI document edits. Later edits were preserved.');
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not undo this run.'); }
  };
  const canvas = focus?.world ? document.querySelector('[data-testid="editor-canvas"]')?.getBoundingClientRect() : null;
  const cursorX = focus?.world ? (canvas?.left ?? 0) + (focus.x - viewport.x) * viewport.zoom : focus?.x;
  const cursorY = focus?.world ? (canvas?.top ?? 0) + (focus.y - viewport.y) * viewport.zoom : focus?.y;
  const panel = <aside id="kumo-ai-panel" className={styles.panel} data-builder="" aria-label="AI chat">
    <header className={styles.header}>
      <strong>Kumo AI</strong>
      <div className={styles.row}>
        <button type="button" disabled={busy} title="New chat — end the previous request and clear the conversation; keep your board edits" aria-label="New chat" onClick={() => void newChat()}><Plus aria-hidden="true" /></button>
        <button type="button" title="Close AI — your conversation stays available in this tab" onClick={onClose} aria-label="Close AI"><X aria-hidden="true" /></button>
      </div>
    </header>
    <div className={styles.body} ref={transcript} onScroll={event => { const node = event.currentTarget; autoScroll.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64; }}>
      {chat.length === 0 && <div className={styles.welcome}>
        <strong>What would you like to make?</strong>
        <p>Ask a question, create something, or refine what’s on your board. You can keep the conversation going as we work.</p>
        <p className={styles.muted}>Your messages and relevant workspace content are sent to OpenAI.</p>
      </div>}
      <div role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" className={styles.conversation}>
        {chat.map(entry => <article key={entry.id} className={`${styles.message} ${entry.role === 'user' ? styles.userMessage : styles.assistantMessage}`} aria-label={entry.role === 'user' ? 'Your message' : 'AI reply'}>
          <span className={styles.speaker}>{entry.role === 'user' ? 'You' : 'Kumo AI'}</span>
          {entry.text && (entry.role === 'assistant' ? <ChatText text={entry.text} /> : <p>{entry.text}</p>)}
          {entry.actions.length > 0 && <details className={styles.actions}><summary>{entry.actions.length} {entry.actions.length === 1 ? 'action' : 'actions'}</summary><ol>{entry.actions.map((item, index) => <li key={index}>{item}</li>)}</ol></details>}
          {!entry.text && entry.actions.length === 0 && <p className={styles.muted}>{entry === chat.at(-1) && busy ? 'Thinking…' : 'No reply was received.'}</p>}
        </article>)}
      </div>
      {handoff && <div className={styles.notice}><p>{handoff.message}</p><div className={styles.row}>{handoff.element && <button type="button" title="Focus the control that needs your input" onClick={() => { handoff.element?.scrollIntoView({ block: 'center' }); handoff.element?.focus(); if (handoff.element?.matches('input[type="file"]')) handoff.element.click(); }}>Show control</button>}<button type="button" title="Continue after completing the requested input" onClick={() => { handoff.resolve(); handoffRef.current = null; setHandoff(null); }}>Continue</button></div></div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {allowance && !allowance.enabled && <p className={styles.notice}>AI is currently unavailable. The workspace administrator needs to enable it.</p>}
      {allowance?.enabled && (!allowance.unmetered && allowance.remainingMicros <= 0) && <p className={styles.notice}>Your AI allowance has been used. Contact the workspace administrator to continue.</p>}
      {!allowance && error && <button type="button" onClick={() => { setError(''); void builderStatus().then(setAllowance).catch(reason => setError(reason.message)); }}>Retry connection</button>}
      {usage && <div className={styles.notice}><p>Hosted AI: {usage.enabled ? 'enabled' : 'disabled'}. Daily cap: ${((usage.caps.day ?? 0) / 1000000).toFixed(2)}.</p><p>{usage.reservations.length} reserved or uncertain requests. Uncertain requests keep their allowance until reconciled.</p><ul>{usage.runs.map(item => <li key={item.id}>{item.user_id} · {item.state} · ${(item.spent_micros / 1000000).toFixed(3)}</li>)}</ul></div>}
    </div>
    <form className={styles.footer} onSubmit={event => { event.preventDefault(); void start(); }}>
      <p role="status" className={styles.status}>{busy && <span className={styles.spinner} aria-hidden="true" />}<span>{busy ? progress : run ? stateLabels[run.state] + (progress && progress !== stateLabels[run.state] ? ` · ${progress}` : '') : error ? 'Connection needs attention' : allowance ? allowance.enabled ? 'Ready' : 'AI unavailable' : 'Connecting…'}</span></p>
      <label className={styles.composerLabel}><span className="sr-only">Message AI</span><textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={8000} rows={3} placeholder={chat.length ? 'Ask a follow-up…' : 'Ask AI to create, edit, or explain…'} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void start(); } }} /></label>
      <div className={styles.settings}>
        <label title="Limit where AI can make changes">Scope<select aria-describedby="ai-scope-help" value={scope} onChange={event => setScope(event.target.value)} disabled={busy}>
          {board.id && selected.length > 0 && <option value="selection">Selection</option>}{board.id && <option value="board">Current board</option>}<option value="workspace">Workspace</option>
        </select></label>
        <label title="Higher effort gives AI more time to think and can use more allowance">Reasoning effort<select aria-describedby="ai-effort-help" value={effort} onChange={event => void changeEffort(event.target.value as Effort)}>{EFFORTS.map(value => <option key={value} value={value}>{effortLabels[value]}</option>)}</select></label>
        {busy ? <button className={styles.send} type="button" onClick={stop} disabled={stopping} title="Stop — keep completed edits and cancel remaining work" aria-label="Stop"><Stop aria-hidden="true" /></button> : <button className={styles.send} type="submit" disabled={!prompt.trim() || !allowance?.enabled || (!allowance.unmetered && allowance.remainingMicros <= 0)} title="Send message — Enter to send, Shift+Enter for a new line" aria-label="Send message"><ArrowUp aria-hidden="true" /></button>}
      </div>
      <details className={styles.options}>
        <summary title="Scope, thinking effort, following the cursor, and usage">AI controls and usage</summary>
        <p id="ai-scope-help">{scope === 'selection' ? 'AI can edit the selected objects and their children.' : scope === 'board' ? 'AI can edit this board.' : 'AI can navigate boards and use workspace tools with your permissions.'}</p>
        <p id="ai-effort-help">Higher effort takes more time and can use more allowance.{busy ? ' Effort changes apply to the next AI request.' : ''}</p>
        <label className={styles.row} title="Move your view with the AI cursor; manual canvas interaction stops following"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} />Follow AI cursor</label>
        <p>{allowance ? allowance.unmetered ? 'No allowance limit for your account' : `$${(allowance.remainingMicros / 1000000).toFixed(2)} allowance remaining` : error ? 'Allowance unavailable' : 'Checking allowance…'}{run ? ` · $${(run.spent_micros / 1000000).toFixed(3)} used this run` : ''}</p>
        {allowance?.operator && <button type="button" title="Review the hosted AI budget and request ledger" onClick={() => { void builderUsage().then(setUsage).catch(reason => setError(reason.message)); }}>Operator usage</button>}
      </details>
      <div className={styles.row}>
        {run && !busy && !['completed', 'failed', 'budget_exhausted'].includes(run.state) && <button type="button" title="Continue this interrupted request on its original board and branch" onClick={() => void resume()}>Resume</button>}
        {run && !busy && board.id && <button type="button" title="Undo this request’s document edits while preserving later manual edits" onClick={() => void undo(run)}><ArrowCounterClockwise aria-hidden="true" />Undo run edits</button>}
      </div>
    </form>
  </aside>;
  return <>
    {busy && focus?.world && focus.shapeIds.map(id => {
      const shape = board.shapes.find(candidate => candidate.id === id);
      if (!shape) return null;
      const bounds = shapeBounds(shape);
      return <div key={id} className={styles.highlight} style={{ left: (canvas?.left ?? 0) + (bounds.x - viewport.x) * viewport.zoom, top: (canvas?.top ?? 0) + (bounds.y - viewport.y) * viewport.zoom, width: bounds.width * viewport.zoom, height: bounds.height * viewport.zoom }} aria-hidden="true" />;
    })}
    {busy && focus && <div className={styles.cursor} style={{ left: cursorX, top: cursorY }} aria-hidden="true"><svg width="18" height="24" viewBox="0 0 18 24"><path d="M1 1L17 15L10 16L6 23Z" fill="currentColor" /></svg><span>AI · {focus.label}</span></div>}
    {visible && (container ? createPortal(panel, container) : panel)}
  </>;
}
