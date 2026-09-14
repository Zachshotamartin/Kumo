import { useSyncExternalStore } from 'react';
import { enableBuilder } from './bridge';

let state: { visible: boolean; busy: boolean; dock: HTMLElement | null } = { visible: false, busy: false, dock: null };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => state;
const update = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
export const useBuilderUI = () => useSyncExternalStore(subscribe, snapshot);
export const setBuilderVisible = (visible: boolean) => { if (visible) enableBuilder(true); update({ visible }); };
export const setBuilderBusy = (busy: boolean) => update({ busy });
export const setBuilderDock = (dock: HTMLElement | null) => update({ dock });
export const resetBuilderUI = () => update({ visible: false, busy: false, dock: null });
export const stopBuilder = () => window.dispatchEvent(new Event('kumo:builder-stop'));
