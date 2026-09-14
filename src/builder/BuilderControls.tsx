import { Stop } from '@phosphor-icons/react';
import { setBuilderDock, setBuilderVisible, stopBuilder, useBuilderUI } from './uiState';
import styles from './BuilderPanel.module.css';

export function BuilderButton({ className = '' }: { className?: string }) {
  const { visible, busy } = useBuilderUI();
  return <div className={styles.entry} data-builder="">
    <button className={`${className} ${styles.entryButton}`} type="button" aria-label="Kumo AI" aria-expanded={visible} aria-controls="kumo-ai-panel" title="Kumo AI — create, edit, and ask questions in a conversation" onClick={() => setBuilderVisible(!visible)}>
      Kumo AI{busy && <i className={styles.spinner} role="img" aria-label="AI is working" />}
    </button>
    {busy && <button className={`${className} ${styles.entryButton}`} type="button" aria-label="Stop AI" title="Stop AI — keep completed edits and cancel remaining work" onClick={stopBuilder}><Stop aria-hidden="true" /></button>}
  </div>;
}

export function BuilderDock() {
  return <div className={styles.dock} ref={setBuilderDock} data-testid="ai-panel-dock" />;
}
