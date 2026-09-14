import type { BuilderSession } from './client';
export interface BuilderRecovery { session: BuilderSession; scope: string; selection: string[]; boardId: string | null; roomId: string | null }
const key = 'kumo:builder-session';
export function readBuilderRecovery(): BuilderRecovery | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as BuilderRecovery;
    return typeof value.session?.runId === 'string' && typeof value.session.lease === 'string' && ['selection', 'board', 'workspace'].includes(value.scope) && Array.isArray(value.selection) ? value : null;
  } catch { return null; }
}
export function writeBuilderRecovery(value: BuilderRecovery | null) {
  try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); } catch { /* Recovery remains possible while this tab is open. */ }
}
