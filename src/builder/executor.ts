import store from '../store';
import { setWhiteboardData } from '../features/whiteBoard/whiteBoardSlice';
import { clearSelectedShapes } from '../features/selected/selectedSlice';
import { getBoard } from '../services/boardRepository';
import { getEditorBridge } from './bridge';
import { validateCapability } from './capabilityManifest';
import type { BuilderOperation } from './protocol';
import { activateControl, fillControl, inspectControls, keyControl, pickBuilderFile, resolveBuilderFile, type Handoff } from './uiCapabilities';

const repositories: Record<string, () => Promise<object>> = {
  asset: () => import('../services/assetRepository'), board: () => import('../services/boardRepository'), branch: () => import('../services/branchRepository'),
  collaborator: () => import('../services/collaboratorRepository'), coverage: () => import('../services/coverageRepository'), font: () => import('../services/fontRepository'),
  platform: () => import('../services/platformRepository'), product: () => import('../services/productRepository'), social: () => import('../services/socialRepository'), version: () => import('../services/versionRepository'),
};
export interface ExecutionContext { runId: string; scope: string; selection: string[]; boardId: string | null; signal: AbortSignal; handoff: Handoff; navigate: (boardId: string, roomId: string | null) => Promise<void> }
export const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
export function builderContext() {
  const state = store.getState();
  const canvas = document.querySelector('[data-testid="editor-canvas"]')?.getBoundingClientRect();
  return JSON.stringify({ canvasSize: canvas ? { width: canvas.width, height: canvas.height } : null, editor: getEditorBridge()?.inspect() ?? null, scope: state.whiteBoard.id ? 'board' : 'workspace', controls: inspectControls().slice(0, 60),
    domains: Object.keys(repositories).concat(['canvas', 'editor', 'ui', 'workspace']) }).slice(0, 16000);
}
export async function executeOperation(operation: BuilderOperation, context: ExecutionContext): Promise<unknown> {
  context.signal.throwIfAborted();
  const capability = validateCapability(operation.capability, operation.args);
  const { domain, name } = capability;
  const { scope, boardId } = context;
  if (scope !== 'workspace') {
    if (['workspace', 'social', 'platform'].includes(domain)) throw new Error('Use Workspace task scope for account and workspace actions.');
    for (let index = 0; index < capability.parameters.length; index += 1) {
      if (/boardId/i.test(capability.parameters[index]!.name) && operation.args[index] !== boardId) throw new Error('This board is outside the run scope.');
    }
  }
  if (scope === 'selection' && !['canvas', 'editor', 'ui', 'asset', 'font'].includes(domain) && !capability.readOnly) throw new Error('This operation changes more than the selected objects. Use Current board or Workspace task scope.');
  if (scope === 'selection' && domain === 'ui' && !capability.readOnly && name !== 'pickFile') throw new Error('Use typed canvas/editor actions inside Selection scope. Interface actions require Current board or Workspace task scope.');
  if (scope !== 'workspace' && !capability.readOnly && repositories[domain] && !capability.parameters.some(parameter => /boardId/i.test(parameter.name))) throw new Error('This action has workspace-wide effects. Use Workspace task scope.');
  if (capability.confirmation) {
    await context.handoff(`Review this action: ${operation.summary}\n${operation.capability}\n${JSON.stringify(operation.args)}`);
    context.signal.throwIfAborted();
  }
  if (domain === 'canvas' || domain === 'editor') {
    const bridge = getEditorBridge();
    if (!bridge || bridge.boardId !== boardId) throw new Error('Wait until the requested board is connected.');
    return bridge.execute(operation, context.runId, scope, context.selection);
  }
  const [first, second, third] = operation.args;
  if (domain === 'ui') {
    if (name === 'inspect') return inspectControls();
    if (name === 'activate') return activateControl(first as string, context.handoff);
    if (name === 'fill') return fillControl(first as string, second as string);
    if (name === 'key') return keyControl(first as string, second as string, third as Parameters<typeof keyControl>[2]);
    return pickBuilderFile(first as string, context.handoff);
  }
  if (operation.capability === 'workspace.open') {
    const id = first as string;
    const board = id ? await getBoard(id) : null;
    context.signal.throwIfAborted();
    await context.navigate(id, board?.roomId ?? null);
    dispatchBoard(board);
    const url = new URL(location.href);
    if (id) url.searchParams.set('board', id); else url.searchParams.delete('board');
    history.pushState({}, '', url);
    // Room entry may suspend; never send another paid step with stale context.
    const deadline = Date.now() + 20000;
    while (id && (getEditorBridge()?.boardId !== id || getEditorBridge()?.roomId !== board!.roomId) && Date.now() < deadline) { context.signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 100)); }
    if (id && (getEditorBridge()?.boardId !== id || getEditorBridge()?.roomId !== board!.roomId)) throw new Error('Board connection timed out. Applied work has been kept.');
    return { opened: id };
  }
  const module = await repositories[domain]!();
  context.signal.throwIfAborted();
  const method = (module as Record<string, (...args: unknown[]) => unknown>)[name];
  const result = await method!(...operation.args.map(resolveBuilderFile));
  return result ?? { completed: true };
}
function dispatchBoard(board: Awaited<ReturnType<typeof getBoard>> | null) {
  store.dispatch(clearSelectedShapes());
  store.dispatch(setWhiteboardData(board ?? { id: null, roomId: null }));
}
