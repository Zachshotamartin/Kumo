import { lazy, Suspense, useEffect, useState } from 'react';
import { enableBuilder } from './bridge';
import styles from './BuilderPanel.module.css';
const BuilderPanel = lazy(() => import('./BuilderPanel'));
export default function BuilderLauncher() {
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => () => enableBuilder(false), []);
  return <>
    <button data-builder="" className={styles.launcher} type="button" aria-expanded={visible} onClick={() => { enableBuilder(true); setLoaded(true); setVisible(value => !value); }}>Build with Astra</button>
    {loaded && <Suspense fallback={<div data-builder="" className={styles.panel} role="status">Opening Astra…</div>}><BuilderPanel visible={visible} onClose={() => setVisible(false)} /></Suspense>}
  </>;
}
