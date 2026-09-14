import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { LiveMap, LiveObject, type LsonObject } from '@liveblocks/client';
import { useHistory, useCanUndo, useCanRedo, useMutation, useRoom } from '@liveblocks/react';
import { useDispatch, useSelector } from 'react-redux';
import { useEditorActionsCore } from '../editor/useEditorActionsCore';
import { applyShapeMutation } from '../collaboration/mutations';
import { storedShape } from '../collaboration/shapes';
import { applyCollaborativeTextChange, type CollaborativeTextCharacter } from '../collaboration/textCrdt';
import { cloneBoardAssets } from '../services/assetRepository';
import { updateBoardSettings } from '../services/boardRepository';
import { setSelectedShapes } from '../features/selected/selectedSlice';
import { setViewport } from '../features/editor/editorSlice';
import { updateBackgroundColor } from '../features/whiteBoard/whiteBoardSlice';
import type { RootState } from '../store';
import type { Shape } from '../classes/shape';
import { isEffectivelyLocked } from '../editor/hierarchy';
import { shapeBounds } from '../editor/geometry';
import { boundedJson, type BuilderOperation } from './protocol';
import { validateCapability, validateShape } from './capabilityManifest';
import { registerEditorBridge, showBuilderFocus } from './bridge';
import { changedShapes, checkDocument, equalValue, patchDocument, undoReceipts, withinSelection, type DocumentReceipt } from './documentOperations';

interface Execution { operation: BuilderOperation; runId: string; scope: string; selection: string[]; cancelled: boolean }
export default function BuilderEditorBridge() {
  const room = useRoom();
  const dispatch = useDispatch();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const editor = useSelector((state: RootState) => state.editor);
  const selected = useSelector((state: RootState) => state.selected.selectedShapes);
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const execution = useRef<Execution | null>(null);
  const [agentSelection, setAgentSelection] = useState<string[]>([]);
  const mutateShapes = useMutation(({ storage, self, others }, next: Shape[], previous: Shape[]) => {
    const active = execution.current;
    if (!active || active.cancelled || !self.canWrite || room.getStatus() !== 'connected') throw new Error('The builder executor is no longer connected with edit access.');
    let receipts = storage.get('builderReceipts');
    if (receipts?.has(active.operation.id)) return;
    const delta = changedShapes(previous, next);
    const nodes = storage.get('nodes');
    const current = [...nodes.values()].map(node => node.toJSON() as unknown as Shape);
    for (const id of delta.ids) {
      const before = previous.find(shape => shape.id === id);
      const after = next.find(shape => shape.id === id);
      const live = current.find(shape => shape.id === id);
      if (before && (!live || !equalValue(storedShape(before), storedShape(live)))) throw new Error('A collaborator changed an object. Inspect again before editing.');
      if (!before && live) throw new Error('An object with this ID already exists.');
      if (after?.parentId && (!before || before.parentId !== after.parentId) && isEffectivelyLocked(next, { ...after, locked: false })) throw new Error('Unlock the destination container before editing it.');
      if (active.scope === 'selection' && before && !withinSelection(previous, id, active.selection)) throw new Error('This object is outside the selected scope.');
      if (before && isEffectivelyLocked(current, before) && !(after?.locked === false && equalValue({ ...before, locked: false }, after))) throw new Error('Unlock the object before editing it.');
      if (self.presence.activeShapeIds.includes(id) || others.some(other => other.presence.activeShapeIds.includes(id) || (other.presence.builder && other.presence.builder.expiresAt > Date.now() && other.presence.builder.shapeIds.includes(id)))) throw new Error('This object is being edited. Wait for its editor to finish.');
    }
    const existingReceipts = receipts ? [...receipts.values()].map(value => JSON.parse(value) as DocumentReceipt) : [];
    const created = existingReceipts.filter(receipt => receipt.runId === active.runId).reduce((count, receipt) => count + receipt.after.filter(shape => !receipt.before.some(before => before.id === shape.id)).length, 0);
    if (created + delta.after.filter(shape => !delta.before.some(before => before.id === shape.id)).length > 100) throw new Error('This run reached its 100-object creation limit.');
    const receipt: DocumentReceipt = { runId: active.runId, operationId: active.operation.id, before: delta.before, after: delta.after, timestamp: Date.now() };
    boundedJson(receipt);
    if (checkDocument(next).some(finding => finding.message === 'Cyclic parent reference' || finding.message === 'Missing parent')) throw new Error('The operation would leave invalid parent references.');
    // Text changes share the same storage batch and operation receipt as shapes.
    const characters = storage.get('textCharacters');
    for (const shape of delta.after.filter(shape => shape.type === 'text')) {
      const old = previous.find(before => before.id === shape.id);
      if (old?.text === shape.text) continue;
      const records = [...characters.values()].map(value => value.toJSON() as unknown as CollaborativeTextCharacter);
      const changed = applyCollaborativeTextChange(records, shape.id, old?.text ?? '', shape.text ?? '', () => crypto.randomUUID());
      for (const record of changed.records) {
        const character = characters.get(record.id);
        if (character) character.update({ deleted: record.deleted, position: record.position });
        else characters.set(record.id, new LiveObject(record as unknown as LsonObject));
      }
    }
    applyShapeMutation(nodes, next, previous);
    if (!receipts) { receipts = new LiveMap<string, string>(); storage.set('builderReceipts', receipts); }
    receipts.set(active.operation.id, JSON.stringify(receipt));
    for (const [id, value] of receipts) if (JSON.parse(value).timestamp < Date.now() - 7 * 86400000) receipts.delete(id);
    while (receipts.size > 512) receipts.delete(receipts.keys().next().value!);
  }, [room]);
  const mutateBackground = useMutation(({ storage, self }, color: string) => {
    const active = execution.current;
    if (!active || active.cancelled || !self.canWrite) throw new Error('Builder edit access is unavailable.');
    if (active.scope === 'selection') throw new Error('A background change requires Current board scope.');
    let receipts = storage.get('builderReceipts');
    if (!receipts) { receipts = new LiveMap<string, string>(); storage.set('builderReceipts', receipts); }
    receipts.set(active.operation.id, JSON.stringify({ runId: active.runId, operationId: active.operation.id, before: [], after: [], beforeBackground: storage.get('backgroundColor'), afterBackground: color, timestamp: Date.now() }));
    while (receipts.size > 512) receipts.delete(receipts.keys().next().value!);
    storage.set('backgroundColor', color);
  }, []);
  const actions = useEditorActionsCore({ mutateShapes, mutateBackground, updateBoardSettings, cloneBoardAssets, history, canUndo, canRedo, selectionOverride: agentSelection });
  const commands = useRef(actions);
  useLayoutEffect(() => { commands.current = actions; }, [actions]);

  useEffect(() => {
    if (!board.id || !board.roomId) return;
    return registerEditorBridge({ boardId: board.id, roomId: board.roomId,
      inspect: () => ({ boardId: board.id, title: board.title, role: board.role, roomId: board.roomId, pageId: editor.currentPageId, viewport: editor.viewport, selectedIds: selected,
        shapeCount: board.shapes.length, shapes: board.shapes.slice(0, 60).map(shape => ({ id: shape.id, type: shape.type, name: shape.name, parentId: shape.parentId, locked: shape.locked, ...shapeBounds(shape) })) }),
      stop: () => { if (execution.current) execution.current.cancelled = true; room.updatePresence({ builder: null }); },
      execute: async (operation, runId, scope, selection) => {
        const capability = validateCapability(operation.capability, operation.args);
        const { root } = await room.getStorage();
        const prior = root.get('builderReceipts')?.get(operation.id);
        if (prior) return { applied: true, duplicate: true };
        const [first] = operation.args;
        if (operation.capability === 'canvas.inspect') {
          const ids = first as string[];
          return board.shapes.filter(shape => ids.length ? ids.includes(shape.id) : !editor.currentPageId || shape.pageId === editor.currentPageId).slice(0, 100).map(storedShape);
        }
        if (operation.capability === 'canvas.check') return checkDocument(board.shapes);
        if (operation.capability === 'canvas.select') { dispatch(setSelectedShapes((first as string[]).filter(id => board.shapes.some(shape => shape.id === id)))); return { selected: first }; }
        if (operation.capability === 'canvas.view') { dispatch(setViewport(first as RootState['editor']['viewport'])); return { viewport: first }; }
        if (!capability.readOnly && !actions.canEdit) throw new Error('This action requires edit access.');
        const active: Execution = { operation, runId, scope, selection, cancelled: false };
        execution.current = active;
        const targetIds = capability.domain === 'editor' ? first as string[] : operation.capability === 'canvas.patch' || operation.capability === 'canvas.create' ? (first as Array<{ id: string }>).map(change => change.id) : selected;
        const target = operation.capability === 'canvas.create' ? (first as Shape[])[0] : board.shapes.find(shape => targetIds.includes(shape.id));
        const position = target ? shapeBounds(target) : { x: editor.viewport.x + 100, y: editor.viewport.y + 100 };
        room.updatePresence({ builder: { runId, x: position.x, y: position.y, shapeIds: targetIds, label: operation.summary, expiresAt: Date.now() + 15000 } });
        showBuilderFocus({ x: position.x, y: position.y, world: true, shapeIds: targetIds, label: operation.summary });
        try {
          if (operation.capability === 'canvas.create') {
            const shapes = first as Shape[];
            if (new Set(shapes.map(shape => shape.id)).size !== shapes.length || shapes.some(shape => !validateShape(shape) || board.shapes.some(existing => existing.id === shape.id))) throw new Error('Create valid shapes with unique IDs.');
            if (scope === 'selection' && shapes.some(shape => !shape.parentId || !withinSelection(board.shapes, shape.parentId, selection))) throw new Error('New objects must be inside the selected container.');
            actions.commitShapes([...board.shapes, ...shapes]);
          } else if (operation.capability === 'canvas.patch') actions.commitShapes(patchDocument(board.shapes, first as Parameters<typeof patchDocument>[1]));
          else if (operation.capability === 'canvas.background') { mutateBackground(first as string); dispatch(updateBackgroundColor(first as string)); }
          else if (operation.capability === 'canvas.undoRun') {
            const receipts = [...(root.get('builderReceipts')?.values() ?? [])].map(value => JSON.parse(value) as DocumentReceipt).filter(receipt => receipt.runId === runId && receipt.operationId !== operation.id);
            actions.commitShapes(undoReceipts(board.shapes, receipts));
            for (const receipt of [...receipts].reverse()) if (receipt.afterBackground !== undefined && root.get('backgroundColor') === receipt.afterBackground) { mutateBackground(receipt.beforeBackground!); dispatch(updateBackgroundColor(receipt.beforeBackground!)); }
          } else {
            flushSync(() => setAgentSelection(targetIds));
            const command = (commands.current as unknown as Record<string, (...args: unknown[]) => unknown>)[capability.name];
            await command!(...operation.args.slice(1));
          }
          return { applied: true, selectedIds: selected };
        } finally { execution.current = null; }
      },
    });
  }, [actions, board, dispatch, editor, mutateBackground, room, selected]);
  useEffect(() => () => { if (execution.current) execution.current.cancelled = true; room.updatePresence({ builder: null }); }, [room]);
  return null;
}
