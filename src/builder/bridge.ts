import type { BuilderOperation } from './protocol';

export interface EditorBridge {
  boardId: string;
  roomId: string;
  execute: (operation: BuilderOperation, runId: string, scope: string, selection: string[]) => Promise<unknown>;
  inspect: () => unknown;
  stop: () => void;
}
let editor: EditorBridge | null = null;
let enabled = false;
const listeners = new Set<() => void>();
export const getBuilderEnabled = () => enabled;
export const subscribeBuilder = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const enableBuilder = (value: boolean) => { enabled = value; listeners.forEach(listener => listener()); };
export const getEditorBridge = () => editor;
export const registerEditorBridge = (next: EditorBridge) => {
  editor = next;
  return () => { if (editor === next) editor = null; };
};

export interface BuilderFocus { x: number; y: number; world: boolean; label: string; shapeIds: string[] }
export const showBuilderFocus = (focus: BuilderFocus | null) => window.dispatchEvent(new CustomEvent('kumo:builder-focus', { detail: focus }));
