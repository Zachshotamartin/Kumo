import { Copy, FlowArrow, Link, Play, Plus, Trash, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addPrototypeInteraction, prototypeFrames, removePrototypeInteraction, setPrototypeStart } from "../../editor/prototype";
import { useEditorActions } from "../../editor/useEditorActions";
import { setPresentationFrameId, setPresentationMode, setRightPanel } from "../../features/editor/editorSlice";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";
import type { Shape } from "../../classes/shape";
import { createPrototypeLink, loadPrototypeLinks, revokePrototypeLink, type PrototypeLink } from "../../services/platformRepository";

const PrototypePanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const actions = useEditorActions();
  const selected = board.shapes.find((shape) => selectedIds.includes(shape.id));
  const frames = prototypeFrames(board.shapes);
  const [trigger, setTrigger] = useState<NonNullable<Shape["prototypeInteractions"]>[number]["trigger"]>("click");
  const [action, setAction] = useState<NonNullable<Shape["prototypeInteractions"]>[number]["action"]>("navigate");
  const [destinationId, setDestinationId] = useState(frames[0]?.id ?? "");
  const [url, setUrl] = useState("https://");
  const [transition, setTransition] = useState<"instant" | "dissolve" | "slide-left" | "slide-right" | "smart-animate">("dissolve");
  const [variableId, setVariableId] = useState("");
  const [variableValue, setVariableValue] = useState("");
  const [triggerKey, setTriggerKey] = useState("Enter");
  const [conditionEnabled, setConditionEnabled] = useState(false);
  const [prototypeLinks, setPrototypeLinks] = useState<PrototypeLink[]>([]);
  const [sharePassword, setSharePassword] = useState("");
  const [deviceFrame, setDeviceFrame] = useState<PrototypeLink["device_frame"]>("none");
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const variables = board.shapes.filter((shape) => shape.type === "resource" && shape.resourceKind?.endsWith("variable") && shape.resourceKind !== "variable-collection");

  useEffect(() => {
    if (!board.id || board.role !== "owner") return;
    void loadPrototypeLinks(board.id).then(setPrototypeLinks).catch(() => undefined);
  }, [board.id, board.role]);

  const add = () => {
    const current = selected!;
    const target = board.shapes.find((shape) => shape.id === destinationId);
    actions.commitShapes(addPrototypeInteraction(board.shapes, current.id, {
      trigger,
      action,
      ...(["navigate", "change-to", "open-overlay", "scroll-to"].includes(action) ? { destinationId } : {}),
      ...(action === "open-board" ? { boardId: target?.boardId ?? destinationId } : {}),
      ...(action === "open-url" ? { url } : {}),
      ...(trigger === "after-delay" ? { delay: 0.8 } : {}),
      ...(trigger === "key-down" ? { key: triggerKey } : {}),
      ...(action === "set-variable" ? { variableId, variableValue } : {}),
      ...(conditionEnabled && variableId ? { condition: { variableId, operator: "equals" as const, value: variableValue } } : {}),
      transition,
      duration: 0.25,
    }));
  };

  return (
    <aside className={styles.inspectorPanel} aria-label="Prototype">
      <div className={styles.panelHeading}>
        <span>Prototype</span>
        <button type="button" aria-label="Close prototype" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button>
      </div>
      <div className={styles.inspectorBody}>
        <section className={styles.inspectorSection}>
          <h2>Flow</h2>
          <button
            type="button"
            disabled={!frames.length}
            onClick={() => {
              dispatch(setPresentationFrameId(selected?.type === "frame" ? selected.id : null));
              dispatch(setPresentationMode(true));
            }}
          >
            <Play aria-hidden="true" /> Present prototype
          </button>
          {selected?.type === "frame" && (
            <label className={styles.toggleRow}>
              <span>Flow starting point</span>
              <input type="checkbox" checked={Boolean(selected.prototypeStart)} onChange={() => actions.commitShapes(setPrototypeStart(board.shapes, selected.id))} />
            </label>
          )}
        </section>

        <section className={styles.inspectorSection}>
          <h2>Interactions</h2>
          {!selected && <p className={styles.fieldHint}>Select an object to connect it to another frame, board, URL, or variant.</p>}
          {selected?.prototypeInteractions?.map((interaction) => (
            <div className={styles.interactionRow} key={interaction.id}>
              <FlowArrow aria-hidden="true" />
              <span><b>{interaction.trigger}</b>{interaction.action} {interaction.destinationId ? `→ ${board.shapes.find((shape) => shape.id === interaction.destinationId)?.name ?? "target"}` : ""}</span>
              <button type="button" aria-label="Remove interaction" onClick={() => actions.commitShapes(removePrototypeInteraction(board.shapes, selected.id, interaction.id))}><Trash aria-hidden="true" /></button>
            </div>
          ))}
          {selected && (
            <div className={styles.interactionForm}>
              <label className={styles.fullField}>
                <span>Trigger</span>
                <select value={trigger} onChange={(event) => setTrigger(event.target.value as typeof trigger)}>
                  <option value="click">On click</option>
                  <option value="hover">While hovering</option>
                  <option value="drag">On drag</option>
                  <option value="after-delay">After delay</option>
                  <option value="mouse-enter">Mouse enters</option>
                  <option value="mouse-leave">Mouse leaves</option>
                  <option value="key-down">Key down</option>
                </select>
              </label>
              {trigger === "key-down" && <label className={styles.fullField}><span>Key</span><input aria-label="Prototype trigger key" value={triggerKey} placeholder="Enter" onChange={(event) => setTriggerKey(event.target.value)} /></label>}
              <label className={styles.fullField}>
                <span>Action</span>
                <select value={action} onChange={(event) => setAction(event.target.value as typeof action)}>
                  <option value="navigate">Navigate to frame</option>
                  <option value="back">Back</option>
                  <option value="open-board">Open linked board</option>
                  <option value="open-url">Open URL</option>
                  <option value="change-to">Change to variant</option>
                  <option value="open-overlay">Open overlay</option>
                  <option value="close-overlay">Close overlay</option>
                  <option value="scroll-to">Scroll to layer</option>
                  <option value="set-variable">Set variable</option>
                </select>
              </label>
              {(["navigate", "change-to", "open-overlay", "scroll-to"].includes(action)) && (
                <label className={styles.fullField}>
                  <span>Destination</span>
                  <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
                    {(action === "navigate" || action === "open-overlay" ? frames : action === "change-to" ? board.shapes.filter((shape) => shape.componentDefinition) : board.shapes.filter((shape) => shape.type !== "resource" && shape.type !== "guide")).map((shape) => <option key={shape.id} value={shape.id}>{shape.name ?? shape.id}</option>)}
                  </select>
                </label>
              )}
              {action === "open-board" && (
                <label className={styles.fullField}>
                  <span>Board object</span>
                  <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
                    {board.shapes.filter((shape) => shape.type === "board" && shape.boardId).map((shape) => <option key={shape.id} value={shape.id}>{shape.title ?? shape.name}</option>)}
                  </select>
                </label>
              )}
              {action === "open-url" && <label className={styles.fullField}><span>URL</span><input value={url} onChange={(event) => setUrl(event.target.value)} /></label>}
              {(action === "set-variable" || conditionEnabled) && <label className={styles.fullField}><span>Variable</span><select value={variableId} onChange={(event) => setVariableId(event.target.value)}><option value="">Choose variable</option>{variables.map((variable) => <option key={variable.id} value={variable.id}>{variable.resourceName}</option>)}</select></label>}
              {(action === "set-variable" || conditionEnabled) && <label className={styles.fullField}><span>Value</span><input value={variableValue} onChange={(event) => setVariableValue(event.target.value)} /></label>}
              <label className={styles.fullField}><span>Transition</span><select value={transition} onChange={(event) => setTransition(event.target.value as typeof transition)}><option value="instant">Instant</option><option value="dissolve">Dissolve</option><option value="slide-left">Slide left</option><option value="slide-right">Slide right</option><option value="smart-animate">Smart animate</option></select></label>
              <label className={styles.toggleRow}><span>Run only when condition matches</span><input type="checkbox" checked={conditionEnabled} onChange={(event) => setConditionEnabled(event.target.checked)} /></label>
              <button type="button" onClick={add}><Plus aria-hidden="true" /> Add interaction</button>
            </div>
          )}
        </section>

        <section className={styles.inspectorSection}>
          <h2><Link aria-hidden="true" /> Prototype delivery</h2>
          <p className={styles.fieldHint}>Share a presentation-only link without granting access to the editor.</p>
          <label className={styles.fullField}><span>Device frame</span><select value={deviceFrame} onChange={(event) => setDeviceFrame(event.target.value as PrototypeLink["device_frame"])}><option value="none">None</option><option value="phone">Phone</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select></label>
          <label className={styles.fullField}><span>Optional password</span><input type="password" value={sharePassword} onChange={(event) => setSharePassword(event.target.value)} /></label>
          <button type="button" disabled={!board.id || board.role !== "owner" || !frames.length} onClick={() => {
            void createPrototypeLink(board.id!, { startShapeId: selected?.type === "frame" ? selected.id : frames.find((frame) => frame.prototypeStart)?.id ?? frames[0]?.id, password: sharePassword || undefined, deviceFrame }).then((result) => { setPrototypeLinks((current) => [result.link, ...current]); setShareMessage(result.url); });
          }}><Plus aria-hidden="true" /> Create prototype link</button>
          {shareMessage && <button type="button" className={styles.assetApply} onClick={() => void navigator.clipboard.writeText(shareMessage)}><Copy aria-hidden="true" /> Copy prototype link</button>}
          <div className={styles.assetList}>{prototypeLinks.filter((link) => !link.revoked_at).map((link) => <div className={styles.assetRow} key={link.id}><span>{link.device_frame} presentation<small>{link.expires_at ? `Expires ${new Date(link.expires_at).toLocaleDateString()}` : "No expiry"}</small></span><button type="button" onClick={() => void revokePrototypeLink(board.id!, link.id).then(() => setPrototypeLinks((current) => current.map((item) => item.id === link.id ? { ...item, revoked_at: new Date().toISOString() } : item)))}>Revoke</button></div>)}</div>
        </section>
      </div>
    </aside>
  );
};

export default PrototypePanel;
