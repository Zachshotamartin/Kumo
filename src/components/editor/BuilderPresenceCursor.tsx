import { useEffect, useState } from 'react';
import { Cursor } from '@phosphor-icons/react';
import type { Viewport } from '../../editor/types';
import { worldToScreen } from '../../editor/geometry';
import styles from './EditorWorkspace.module.css';

export default function BuilderPresenceCursor({ presence, viewport }: { presence: { x: number; y: number; label: string; expiresAt: number }; viewport: Viewport }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (presence.expiresAt <= now) return null;
  const point = worldToScreen(presence, viewport);
  return <div className={styles.remoteCursor} style={{ left: point.x, top: point.y }}>
    <span className={styles.cursorArrow}><Cursor aria-hidden="true" weight="fill" /></span>
    <span className={styles.cursorLabel}>Astra · {presence.label}</span>
  </div>;
}
