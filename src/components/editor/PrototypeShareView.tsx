import { ArrowLeft, LockSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { Shape } from "../../classes/shape";
import { normalizeShape, shapeBounds } from "../../editor/geometry";
import { redeemPrototype } from "../../services/platformRepository";
import ui from "../ui/Ui.module.css";
import styles from "./PrototypeShareView.module.css";

const PrototypeShareView = ({ token }: { token: string }) => {
  const [password, setPassword] = useState("");
  const [prototype, setPrototype] = useState<Awaited<ReturnType<typeof redeemPrototype>> | null>(null);
  const [frameId, setFrameId] = useState<string | null>(null);
  const [, setHistory] = useState<string[]>([]);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async (secret = "") => {
    try { const result = await redeemPrototype(token, secret); setPrototype(result); setFrameId(result.startShapeId); setNeedsPassword(false); setError(null); }
    catch (caught) { const message = caught instanceof Error ? caught.message : "Prototype could not be opened."; setNeedsPassword(/password/i.test(message)); setError(message); }
  };
  useEffect(() => {
    let active = true;
    void redeemPrototype(token, "").then((result) => {
      if (!active) return;
      setPrototype(result);
      setFrameId(result.startShapeId);
      setNeedsPassword(false);
      setError(null);
    }).catch((caught) => {
      if (!active) return;
      const message = caught instanceof Error ? caught.message : "Prototype could not be opened.";
      setNeedsPassword(/password/i.test(message));
      setError(message);
    });
    return () => { active = false; };
  }, [token]);
  const shapes = useMemo(() => Object.values((prototype?.document.nodes ?? {}) as Record<string, unknown>).map((value) => normalizeShape(value as Shape)), [prototype]);
  const frames = shapes.filter((shape) => shape.type === "frame");
  const active = frames.find((frame) => frame.id === frameId) ?? frames.find((frame) => frame.prototypeStart) ?? frames[0];
  const children = useMemo(() => {
    if (!active) return [];
    const included = new Set([active.id]);
    let changed = true;
    while (changed) {
      changed = false;
      shapes.forEach((shape) => {
        if (shape.parentId && included.has(shape.parentId) && !included.has(shape.id)) { included.add(shape.id); changed = true; }
      });
    }
    return shapes.filter((shape) => included.has(shape.id));
  }, [active, shapes]);
  const bounds = active ? shapeBounds(active) : { x: 0, y: 0, width: 1000, height: 700 };
  const navigate = (destinationId?: string) => { if (!destinationId || !active) return; setHistory((current) => [...current, active.id]); setFrameId(destinationId); };
  const goBack = () => setHistory((current) => { const next = [...current]; const target = next.pop(); if (target) setFrameId(target); return next; });
  return <main className={styles.page} data-device={prototype?.deviceFrame ?? "none"}>
    <header><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => { const url = new URL(window.location.href); url.searchParams.delete("prototype"); window.location.assign(url.toString()); }}><ArrowLeft aria-hidden="true" /> Back to Kumo</button><strong>{prototype?.title ?? "Prototype"}</strong><span>{frames.length} screens</span></header>
    {needsPassword && <form className={styles.password} onSubmit={(event) => { event.preventDefault(); void load(password); }}><LockSimple aria-hidden="true" /><h1>Password protected</h1><input aria-label="Prototype password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className={`${ui.button} ${ui.buttonPrimary}`} type="submit">Open prototype</button></form>}
    {!needsPassword && !prototype && <p role="status">Opening prototype…</p>}
    {prototype && active && <div className={styles.device}><div className={styles.stage} style={{ aspectRatio: `${bounds.width} / ${bounds.height}`, background: active.backgroundColor ?? "#fff" }}>{children.filter((shape) => shape.id !== active.id).map((shape) => {
      const item = shapeBounds(shape); const interaction = shape.prototypeInteractions?.find((candidate) => candidate.trigger === "click");
      return <button type="button" key={shape.id} className={styles.layer} aria-label={shape.name ?? shape.text ?? shape.type} style={{ left: `${(item.x - bounds.x) / bounds.width * 100}%`, top: `${(item.y - bounds.y) / bounds.height * 100}%`, width: `${item.width / bounds.width * 100}%`, height: `${item.height / bounds.height * 100}%`, background: shape.backgroundColor ?? "transparent", borderRadius: shape.type === "ellipse" ? "50%" : shape.borderRadius, color: shape.color }} onClick={() => { if (!interaction) return; if (interaction.action === "back") goBack(); else if (interaction.action === "open-url" && interaction.url) window.open(interaction.url, "_blank", "noopener,noreferrer"); else navigate(interaction.destinationId); }}>{shape.type === "text" ? shape.text : null}</button>;
    })}</div></div>}
    {prototype && !active && <p>This prototype has no frames yet.</p>}{error && !needsPassword && <p className={styles.error} role="alert">{error}</p>}
  </main>;
};

export default PrototypeShareView;
