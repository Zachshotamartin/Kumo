import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { Shape } from "../classes/shape";
import ui from "../components/ui/Ui.module.css";
import { shapeBounds } from "../editor/geometry";
import { getSharedBoardVersion, type BoardVersionDetail } from "../services/versionRepository";
import styles from "./VersionShareView.module.css";

const VersionShareView = ({ versionId, token }: { versionId: string; token: string }) => {
  const [version, setVersion] = useState<(BoardVersionDetail & { boardTitle: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getSharedBoardVersion(versionId, token)
      .then((value) => active && setVersion(value))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Version could not be opened."));
    return () => { active = false; };
  }, [token, versionId]);
  const shapes = useMemo(() => Object.values(version?.document.nodes ?? {}) as unknown as Shape[], [version]);
  const scene = useMemo(() => {
    if (!shapes.length) return { x: 0, y: 0, width: 1000, height: 700 };
    const bounds = shapes.map(shapeBounds);
    const left = Math.min(...bounds.map((item) => item.x));
    const top = Math.min(...bounds.map((item) => item.y));
    const right = Math.max(...bounds.map((item) => item.x + item.width));
    const bottom = Math.max(...bounds.map((item) => item.y + item.height));
    return { x: left - 40, y: top - 40, width: Math.max(80, right - left + 80), height: Math.max(80, bottom - top + 80) };
  }, [shapes]);
  const close = () => {
    const url = new URL(window.location.href);
    ["version", "versionToken", "board"].forEach((key) => url.searchParams.delete(key));
    window.location.assign(url.toString());
  };
  return <main className={styles.page}>
    <header><button className={`${ui.button} ${ui.buttonGhost}`} type="button" onClick={close}><ArrowLeft aria-hidden="true" /> Back to Kumo</button><span><strong>{version?.boardTitle ?? "Shared Kumo version"}</strong>{version && <small>{version.name ?? "Historical version"} · {new Date(version.created_at).toLocaleString()}</small>}</span><b>Read-only snapshot</b></header>
    {!version && !error && <p role="status">Opening shared version…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {version && <svg className={styles.canvas} viewBox={`${scene.x} ${scene.y} ${scene.width} ${scene.height}`} style={{ background: version.document.backgroundColor }} role="img" aria-label={`Snapshot of ${version.boardTitle}`}>{shapes.filter((shape) => !shape.hidden).sort((left, right) => left.zIndex - right.zIndex).map((shape) => {
      const bounds = shapeBounds(shape);
      const transform = `rotate(${shape.rotation ?? 0} ${bounds.x + bounds.width / 2} ${bounds.y + bounds.height / 2})`;
      if (shape.type === "ellipse") return <ellipse key={shape.id} transform={transform} cx={bounds.x + bounds.width / 2} cy={bounds.y + bounds.height / 2} rx={bounds.width / 2} ry={bounds.height / 2} fill={shape.backgroundColor ?? "transparent"} stroke={shape.borderColor} />;
      if (shape.type === "text") return <text key={shape.id} transform={transform} x={bounds.x} y={bounds.y + (shape.fontSize ?? 18)} fill={shape.color ?? "#17181a"} fontSize={shape.fontSize ?? 18} fontFamily={shape.fontFamily}>{shape.text}</text>;
      return <rect key={shape.id} transform={transform} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} rx={shape.borderRadius ?? 0} fill={shape.backgroundColor ?? "transparent"} stroke={shape.borderColor} />;
    })}</svg>}
  </main>;
};

export default VersionShareView;
