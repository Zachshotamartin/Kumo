import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { enableBuilder, getBuilderEnabled, subscribeBuilder } from './bridge';
import { resetBuilderUI, setBuilderVisible, useBuilderUI } from './uiState';
import styles from './BuilderPanel.module.css';
const BuilderPanel = lazy(() => import('./BuilderPanel'));
export default function BuilderLauncher() {
  const loaded = useSyncExternalStore(subscribeBuilder, getBuilderEnabled);
  const { visible, dock } = useBuilderUI();
  useEffect(() => () => { enableBuilder(false); resetBuilderUI(); }, []);
  return loaded && <Suspense fallback={visible && dock ? createPortal(<div data-builder="" className={styles.panel} role="status">Opening AI…</div>, dock) : null}>
    <BuilderPanel visible={visible && Boolean(dock)} container={dock ?? undefined} onClose={() => setBuilderVisible(false)} />
  </Suspense>;
}
