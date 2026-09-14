import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CaretDown, SlidersHorizontal } from '@phosphor-icons/react';
import styles from './EditorWorkspace.module.css';

export default function ToolbarOverflow({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const disclosure = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (disclosure.current && !disclosure.current.contains(event.target as Node)) setOpen(false);
    };
    // Keyboard-generated button clicks take the same close path as pointer input.
    const action = (event: MouseEvent) => {
      if (menu.current?.contains(event.target as Node) && (event.target as Element).closest('button')) { setOpen(false); trigger.current!.focus(); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && disclosure.current?.contains(event.target as Node)) { event.preventDefault(); setOpen(false); trigger.current!.focus(); }
    };
    window.addEventListener('pointerdown', outside); window.addEventListener('click', action); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('click', action); window.removeEventListener('keydown', escape); };
  }, []);
  return <>
    <div className={styles.toolbarWide}>{children}</div>
    <div ref={disclosure} className={styles.toolbarOverflow}>
      <button type="button" ref={trigger} className={styles.toolbarTrigger} aria-expanded={open} aria-controls="workspace-tools-menu" onClick={() => setOpen(value => !value)} title="Workspace tools — presentation, comments, assets, export, and more"><SlidersHorizontal aria-hidden="true" /><span>Workspace tools</span><CaretDown aria-hidden="true" /></button>
      {open && <div ref={menu} id="workspace-tools-menu" className={styles.toolbarDropdown} role="group" aria-label="Workspace tools">{children}</div>}
    </div>
  </>;
}
