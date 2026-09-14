import { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider, useSelector } from 'react-redux';
import store, { type RootState } from '../store';
import EditorHarness from './EditorHarness';
import BuilderLauncher from '../builder/BuilderLauncher';
import { registerEditorBridge, showBuilderFocus } from '../builder/bridge';
import { useLocalEditorActions } from './useLocalEditorActions';
import { patchDocument } from '../builder/documentOperations';
import type { Shape } from '../classes/shape';
import '../index.css';

// Browser-only deterministic fixture. Collaboration mutation/receipt behavior
// is tested separately against real LiveMap/LiveObject instances.
export function LocalBuilderAdapter() {
  const actions = useLocalEditorActions();
  const board = useSelector((state: RootState) => state.whiteBoard);
  useEffect(() => registerEditorBridge({ boardId: board.id ?? '', roomId: board.roomId ?? '', inspect: () => ({ shapes: board.shapes }), stop: () => {}, execute: async operation => {
    const first = operation.args[0];
    if (operation.capability === 'canvas.create') {
      const shapes = first as Shape[];
      showBuilderFocus({ x: shapes[0]!.x1, y: shapes[0]!.y1, world: true, shapeIds: shapes.map(shape => shape.id), label: operation.summary });
      actions.commitShapes([...board.shapes, ...shapes]);
    } else if (operation.capability === 'canvas.patch') actions.commitShapes(patchDocument(board.shapes, first as Parameters<typeof patchDocument>[1]));
    else if (operation.capability === 'canvas.check') return [];
    else throw new Error('Unsupported regression fixture operation.');
    return { applied: true };
  } }), [actions, board]);
  return null;
}
ReactDOM.createRoot(document.getElementById('root')!).render(import.meta.env.DEV && import.meta.env.VITE_E2E === 'true'
  ? <Provider store={store}><EditorHarness /><LocalBuilderAdapter /><BuilderLauncher /></Provider>
  : <div role="alert">This regression lab is available only to the Playwright development server.</div>);
