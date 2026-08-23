import { FlowArrow, Play, Plus, Trash, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addPrototypeInteraction, prototypeFrames, removePrototypeInteraction, setPrototypeStart } from "../../editor/prototype";
import { useEditorActions } from "../../editor/useEditorActions";
import { setPresentationFrameId, setPresentationMode, setRightPanel } from "../../features/editor/editorSlice";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const PrototypePanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const actions = useEditorActions();
  const selected = board.shapes.find((shape) => selectedIds.includes(shape.id));
  const frames = prototypeFrames(board.shapes);
  const [trigger, setTrigger] = useState<"click" | "hover" | "drag" | "after-delay">("click");
  const [action, setAction] = useState<"navigate" | "back" | "open-board" | "open-url" | "change-to">("navigate");
  const [destinationId, setDestinationId] = useState(frames[0]?.id ?? "");
  const [url, setUrl] = useState("https://");

  const add = () => {
    if (!selected) return;
    const target = board.shapes.find((shape) => shape.id === destinationId);
    actions.commitShapes(addPrototypeInteraction(board.shapes, selected.id, {
      trigger,
      action,
      ...(action === "navigate" || action === "change-to" ? { destinationId } : {}),
      ...(action === "open-board" ? { boardId: target?.boardId ?? destinationId } : {}),
      ...(action === "open-url" ? { url } : {}),
      ...(trigger === "after-delay" ? { delay: 0.8 } : {}),
      transition: action === "navigate" ? "dissolve" : "instant",
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
                </select>
              </label>
              <label className={styles.fullField}>
                <span>Action</span>
                <select value={action} onChange={(event) => setAction(event.target.value as typeof action)}>
                  <option value="navigate">Navigate to frame</option>
                  <option value="back">Back</option>
                  <option value="open-board">Open linked board</option>
                  <option value="open-url">Open URL</option>
                  <option value="change-to">Change to variant</option>
                </select>
              </label>
              {(action === "navigate" || action === "change-to") && (
                <label className={styles.fullField}>
                  <span>Destination</span>
                  <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
                    {(action === "navigate" ? frames : board.shapes.filter((shape) => shape.componentDefinition)).map((shape) => <option key={shape.id} value={shape.id}>{shape.name ?? shape.id}</option>)}
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
              <button type="button" onClick={add}><Plus aria-hidden="true" /> Add interaction</button>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};

export default PrototypePanel;
