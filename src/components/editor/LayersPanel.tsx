/* eslint-disable react-refresh/only-export-components -- layer presentation helpers are intentionally exported with the panel. */
import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  CaretRight,
  Circle,
  Copy,
  Eye,
  EyeSlash,
  FrameCorners,
  Graph,
  ImageSquare,
  Lock,
  LockOpen,
  Plus,
  Rectangle,
  Stack,
  TextT,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import type { Shape } from "../../classes/shape";
import { moveShapesRelative, orderShapes, type RelativeOrder } from "../../editor/commands";
import { buildLayerUnits, type LayerUnit } from "../../editor/layers";
import { useEditorActions, type EditorActions } from "../../editor/useEditorActions";
import { clearSelectedShapes, setSelectedShapes } from "../../features/selected/selectedSlice";
import { setCurrentPageId } from "../../features/editor/editorSlice";
import { documentPages, shapesOnPage } from "../../editor/workspace";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const layerIcon = (type: string): Icon => {
  if (type === "text") return TextT;
  if (type === "ellipse") return Circle;
  if (type === "image") return ImageSquare;
  if (type === "board") return Graph;
  if (type === "frame") return FrameCorners;
  return Rectangle;
};

export const layerUnitLabel = (unit: LayerUnit) => unit.groupId
  ? `${unit.members[0]!.groupName || "Group"}, ${unit.members.length} layers`
  : unit.members[0]!.name || unit.members[0]!.type;

export const layerDropPlacement = (clientY: number, bounds: Pick<DOMRect, "top" | "height">): RelativeOrder =>
  clientY < bounds.top + bounds.height / 2 ? "front" : "back";

export const layerDisplayName = (isGroup: boolean, shape: Shape) =>
  isGroup ? shape.groupName || "Group" : shape.name || shape.type;

export const layerDropClass = (target: { key: string; placement: RelativeOrder } | null, key: string) => {
  if (target?.key !== key) return "";
  return target.placement === "front" ? styles.dropInFront : styles.dropBehind;
};

const LayerNameInput = ({
  label,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancellingRef = useRef(false);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <input
      ref={inputRef}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        if (cancellingRef.current) onCancel();
        else onCommit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancellingRef.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
};

export const LayersPanelView = ({ actions }: { actions: EditorActions }) => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const draggedIdsRef = useRef<string[] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; placement: RelativeOrder } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const currentPageId = useSelector((state: RootState) => state.editor.currentPageId);
  const pages = documentPages(board.shapes);
  const activePageId = currentPageId && pages.some((page) => page.id === currentPageId) ? currentPageId : pages[0]!.id;
  const pageShapes = shapesOnPage(board.shapes, activePageId);
  const units = buildLayerUnits(pageShapes);

  const selectUnit = (event: MouseEvent, ids: string[]) => {
    if (event.shiftKey) {
      const next = new Set(selectedIds);
      const removing = ids.every((id) => next.has(id));
      ids.forEach((id) => (removing ? next.delete(id) : next.add(id)));
      dispatch(setSelectedShapes([...next]));
      return;
    }
    dispatch(setSelectedShapes(ids));
  };

  const toggleShapes = (
    shapeIds: readonly string[],
    field: "locked" | "hidden",
    value: boolean
  ) => {
    const affected = new Set(shapeIds);
    actions.commitShapes(
      board.shapes.map((shape) =>
        affected.has(shape.id) ? { ...shape, [field]: value } : shape
      )
    );
  };

  const toggleMember = (shape: Shape, field: "locked" | "hidden", value: boolean) => {
    const ids = field === "locked" && shape.groupId
      ? board.shapes.filter((candidate) => candidate.groupId === shape.groupId).map((candidate) => candidate.id)
      : [shape.id];
    toggleShapes(ids, field, value);
  };

  const moveUnit = (unit: LayerUnit, mode: "forward" | "backward") => {
    actions.commitShapes(orderShapes(board.shapes, unit.ids, mode));
    dispatch(setSelectedShapes(unit.ids));
  };

  const startDrag = (event: DragEvent, unit: LayerUnit) => {
    if (!actions.canEdit) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", unit.key);
    draggedIdsRef.current = unit.ids;
    dispatch(setSelectedShapes(unit.ids));
  };

  const updateDropTarget = (event: DragEvent, unit: LayerUnit) => {
    const activeIds = draggedIdsRef.current;
    if (!activeIds || unit.ids.some((id) => activeIds.includes(id))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = layerDropPlacement(event.clientY, bounds);
    setDropTarget({ key: unit.key, placement });
  };

  const finishDrop = (event: DragEvent, unit: LayerUnit) => {
    event.preventDefault();
    const activeIds = draggedIdsRef.current;
    if (activeIds && !unit.ids.some((id) => activeIds.includes(id))) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const placement = layerDropPlacement(event.clientY, bounds);
      actions.commitShapes(
        moveShapesRelative(
          board.shapes,
          activeIds,
          unit.members[0]!.id,
          placement
        )
      );
      dispatch(setSelectedShapes(activeIds));
    }
    draggedIdsRef.current = null;
    setDropTarget(null);
  };

  const finishDrag = () => {
    draggedIdsRef.current = null;
    setDropTarget(null);
  };

  const finishRename = (shape: Shape) => {
    const name = draftName.trim() || shape.type;
    actions.commitShapes(
      board.shapes.map((candidate) => candidate.id === shape.id ? { ...candidate, name } : candidate)
    );
    setRenamingId(null);
  };

  const finishUnitRename = (unit: LayerUnit) => {
    const name = draftName.trim() || (unit.groupId ? "Group" : unit.members[0]!.type);
    const ids = new Set(unit.ids);
    actions.commitShapes(
      board.shapes.map((shape) => {
        if (!ids.has(shape.id)) return shape;
        return unit.groupId ? { ...shape, groupName: name } : { ...shape, name };
      })
    );
    setRenamingId(null);
  };

  const renderMember = (shape: Shape) => {
    const LayerIcon = layerIcon(shape.type);
    const name = shape.name ?? shape.type;
    const selected = selectedIds.includes(shape.id);
    const selectionIds = board.shapes.filter((candidate) => candidate.groupId === shape.groupId).map((candidate) => candidate.id);
    return (
      <div
        className={`${styles.layerRow} ${styles.nestedLayerRow} ${selected ? styles.selectedLayer : ""}`}
        key={shape.id}
      >
        <span className={styles.layerIndent} aria-hidden="true" />
        {renamingId === shape.id ? (
          <div className={styles.layerRename}>
            <span className={styles.layerType} aria-hidden="true"><LayerIcon /></span>
            <LayerNameInput
              label={`Rename ${name}`}
              value={draftName}
              onChange={setDraftName}
              onCommit={() => finishRename(shape)}
              onCancel={() => setRenamingId(null)}
            />
          </div>
        ) : (
          <button
            className={styles.layerMain}
            type="button"
            aria-pressed={selected}
            onClick={(event) => selectUnit(event, selectionIds)}
            onDoubleClick={() => {
              if (!actions.canEdit) return;
              setDraftName(name);
              setRenamingId(shape.id);
            }}
          >
            <span className={styles.layerType} aria-hidden="true"><LayerIcon /></span>
            <span className={styles.layerName}>{name}</span>
          </button>
        )}
        <span className={styles.layerActionSpacer} />
        <span className={styles.layerActionSpacer} />
        <button
          type="button"
          className={styles.layerAction}
          aria-label={`${shape.hidden ? "Show" : "Hide"} ${name}`}
          title={shape.hidden ? "Show" : "Hide"}
          disabled={!actions.canEdit}
          onClick={() => toggleMember(shape, "hidden", !shape.hidden)}
        >
          {shape.hidden ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={styles.layerAction}
          aria-label={`${shape.locked ? "Unlock" : "Lock"} ${name}`}
          title={shape.locked ? "Unlock" : "Lock"}
          disabled={!actions.canEdit}
          onClick={() => toggleMember(shape, "locked", !shape.locked)}
        >
          {shape.locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
        </button>
      </div>
    );
  };

  const renderFrameChildren = (frameId: string, depth = 1): ReactNode => {
    const childUnits = buildLayerUnits(pageShapes, frameId);
    return childUnits.map((unit) => {
      const isGroup = Boolean(unit.groupId);
      const shape = unit.members[0]!;
      const isFrame = !isGroup && (shape.type === "frame" || shape.type === "section");
      const label = layerUnitLabel(unit);
      const key = isGroup ? unit.key : `frame-child:${shape.id}`;
      const collapsedKey = isGroup ? unit.groupId! : `frame:${shape.id}`;
      const collapsed = collapsedGroups.has(collapsedKey);
      const selectionIds = unit.ids;
      const selected = selectionIds.every((id) => selectedIds.includes(id));
      const UnitIcon = isGroup ? Stack : layerIcon(shape.type);
      const dropClass = layerDropClass(dropTarget, unit.key);
      return (
        <div
          className={`${styles.layerUnit} ${dropClass}`}
          key={key}
          style={{ paddingLeft: `${depth * 12}px` }}
          onDragOver={(event) => updateDropTarget(event, unit)}
          onDrop={(event) => finishDrop(event, unit)}
        >
          <div className={`${styles.layerRow} ${styles.nestedLayerRow} ${selected ? styles.selectedLayer : ""}`}>
            {isGroup || isFrame ? (
              <button
                type="button"
                className={`${styles.layerAction} ${styles.layerDisclosure}`}
                aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
                aria-expanded={!collapsed}
                onClick={() => setCollapsedGroups((current) => {
                  const next = new Set(current);
                  if (next.has(collapsedKey)) next.delete(collapsedKey);
                  else next.add(collapsedKey);
                  return next;
                })}
              >
                {collapsed ? <CaretRight aria-hidden="true" /> : <CaretDown aria-hidden="true" />}
              </button>
            ) : <span className={styles.layerIndent} aria-hidden="true" />}
            {renamingId === key ? (
              <div className={styles.layerRename}>
                <span className={styles.layerType} aria-hidden="true"><UnitIcon /></span>
                <LayerNameInput
                  label={`Rename ${label}`}
                  value={draftName}
                  onChange={setDraftName}
                  onCommit={() => finishUnitRename(unit)}
                  onCancel={() => setRenamingId(null)}
                />
              </div>
            ) : (
              <button
                className={styles.layerMain}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                draggable={actions.canEdit}
                title="Drag to reorder"
                onDragStart={(event) => startDrag(event, unit)}
                onDragEnd={finishDrag}
                onClick={(event) => selectUnit(event, selectionIds)}
                onDoubleClick={() => {
                  if (!actions.canEdit) return;
                  setDraftName(layerDisplayName(isGroup, shape));
                  setRenamingId(key);
                }}
              >
                <span className={styles.layerType} aria-hidden="true"><UnitIcon /></span>
                <span className={styles.layerName}>{label}</span>
              </button>
            )}
            <button
              type="button"
              className={styles.layerAction}
              aria-label={`Move ${label} forward`}
              disabled={!actions.canEdit}
              onClick={() => moveUnit(unit, "forward")}
            >
              <ArrowUp aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.layerAction}
              aria-label={`Move ${label} backward`}
              disabled={!actions.canEdit}
              onClick={() => moveUnit(unit, "backward")}
            >
              <ArrowDown aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.layerAction}
              aria-label={`${unit.members.every((member) => member.hidden) ? "Show" : "Hide"} ${label}`}
              disabled={!actions.canEdit}
              onClick={() => toggleShapes(unit.ids, "hidden", !unit.members.every((member) => member.hidden))}
            >
              {unit.members.every((member) => member.hidden) ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
            <button
              type="button"
              className={styles.layerAction}
              aria-label={`${unit.members.every((member) => member.locked) ? "Unlock" : "Lock"} ${label}`}
              disabled={!actions.canEdit}
              onClick={() => toggleShapes(unit.ids, "locked", !unit.members.every((member) => member.locked))}
            >
              {unit.members.every((member) => member.locked) ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
            </button>
          </div>
          {!collapsed && isGroup && unit.members.map((member) => renderMember(member))}
          {!collapsed && isFrame && renderFrameChildren(shape.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <aside className={styles.layersPanel} aria-label="Layers">
      <section className={styles.pagesSection} aria-label="Pages">
        <div className={styles.panelHeading}>
          <span>Pages</span>
          <button type="button" aria-label="Add page" disabled={!actions.canEdit} onClick={actions.addPage}><Plus aria-hidden="true" /></button>
        </div>
        <div className={styles.pageList}>
          {pages.map((page) => (
            <div className={`${styles.pageRow} ${page.id === activePageId ? styles.activePage : ""}`} key={page.id}>
              {page.implicit ? (
                <button
                  type="button"
                  aria-pressed={page.id === activePageId}
                  onClick={() => { dispatch(setCurrentPageId(page.id)); dispatch(clearSelectedShapes()); }}
                >
                  {page.name}
                </button>
              ) : (
                <input
                  key={`${page.id}:${page.name}`}
                  defaultValue={page.name}
                  aria-label={`Rename ${page.name}`}
                  onFocus={(event) => {
                    dispatch(setCurrentPageId(page.id));
                    dispatch(clearSelectedShapes());
                    event.currentTarget.select();
                  }}
                  onBlur={(event) => actions.renameDocumentPage(page.id, event.currentTarget.value)}
                  onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                />
              )}
              {!page.implicit && actions.canEdit && (
                <>
                  <button type="button" aria-label={`Duplicate ${page.name}`} onClick={() => actions.duplicateDocumentPage(page.id)}><Copy aria-hidden="true" /></button>
                  <button type="button" aria-label={`Delete ${page.name}`} disabled={pages.length <= 1} onClick={() => actions.deleteDocumentPage(page.id)}><Trash aria-hidden="true" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
      <div className={styles.panelHeading}>
        <span>Layers</span>
        <span className={styles.count}>{pageShapes.length}</span>
      </div>
      <div className={styles.layerList} role={pageShapes.length ? "list" : undefined} aria-label={pageShapes.length ? "Layer stack" : undefined}>
        {pageShapes.length === 0 ? (
          <div className={styles.emptyPanel}>
            <span className={styles.emptyMark}><Plus aria-hidden="true" /></span>
            <p>Draw a shape to start this board.</p>
            <small>R rectangle / O ellipse / T text</small>
          </div>
        ) : units.map((unit, unitIndex) => {
          const isGroup = Boolean(unit.groupId);
          const isFrame = !isGroup && (unit.members[0]?.type === "frame" || unit.members[0]?.type === "section");
          const isContainer = isGroup || isFrame;
          const label = layerUnitLabel(unit);
          const selected = unit.ids.every((id) => selectedIds.includes(id));
          const collapsedKey = unit.groupId ?? `frame:${unit.members[0]?.id}`;
          const collapsed = isContainer ? collapsedGroups.has(collapsedKey) : false;
          const allHidden = unit.members.every((shape) => shape.hidden);
          const allLocked = unit.members.every((shape) => shape.locked);
          const dropClass = layerDropClass(dropTarget, unit.key);
          const UnitIcon = isGroup ? Stack : layerIcon(unit.members[0]!.type);

          return (
            <div
              className={`${styles.layerUnit} ${dropClass}`}
              key={unit.key}
              role="listitem"
              onDragOver={(event) => updateDropTarget(event, unit)}
              onDrop={(event) => finishDrop(event, unit)}
            >
              <div className={`${styles.layerRow} ${isContainer ? styles.groupLayerRow : ""} ${selected ? styles.selectedLayer : ""}`}>
                {isContainer ? (
                  <button
                    type="button"
                    className={`${styles.layerAction} ${styles.layerDisclosure}`}
                    aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
                    aria-expanded={!collapsed}
                    onClick={() => setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(collapsedKey)) next.delete(collapsedKey);
                      else next.add(collapsedKey);
                      return next;
                    })}
                  >
                    {collapsed ? <CaretRight aria-hidden="true" /> : <CaretDown aria-hidden="true" />}
                  </button>
                ) : <span className={styles.layerIndent} aria-hidden="true" />}
                {renamingId === (isGroup ? unit.key : unit.members[0]?.id) ? (
                  <div className={styles.layerRename}>
                    <span className={styles.layerType} aria-hidden="true"><UnitIcon /></span>
                    <LayerNameInput
                      label={`Rename ${label}`}
                      value={draftName}
                      onChange={setDraftName}
                      onCommit={() => finishUnitRename(unit)}
                      onCancel={() => setRenamingId(null)}
                    />
                  </div>
                ) : (
                  <button
                    className={styles.layerMain}
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    draggable={actions.canEdit}
                    title="Drag to reorder"
                    onDragStart={(event) => startDrag(event, unit)}
                    onDragEnd={finishDrag}
                    onClick={(event) => selectUnit(event, unit.ids)}
                    onDoubleClick={() => {
                      const shape = unit.members[0]!;
                      if (actions.canEdit) {
                        setDraftName(layerDisplayName(isGroup, shape));
                        setRenamingId(isGroup ? unit.key : shape.id);
                      }
                    }}
                  >
                    <span className={styles.layerType} aria-hidden="true"><UnitIcon /></span>
                    <span className={styles.layerName}>{layerDisplayName(isGroup, unit.members[0]!)}</span>
                    {isGroup && <span className={styles.groupCount} aria-hidden="true">{unit.members.length}</span>}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.layerAction}
                  aria-label={`Move ${label} forward`}
                  title="Move forward"
                  disabled={!actions.canEdit || unitIndex === 0}
                  onClick={() => moveUnit(unit, "forward")}
                >
                  <ArrowUp aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.layerAction}
                  aria-label={`Move ${label} backward`}
                  title="Move backward"
                  disabled={!actions.canEdit || unitIndex === units.length - 1}
                  onClick={() => moveUnit(unit, "backward")}
                >
                  <ArrowDown aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.layerAction}
                  aria-label={`${allHidden ? "Show" : "Hide"} ${label}`}
                  title={allHidden ? "Show" : "Hide"}
                  disabled={!actions.canEdit}
                  onClick={() => toggleShapes(unit.ids, "hidden", !allHidden)}
                >
                  {allHidden ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className={styles.layerAction}
                  aria-label={`${allLocked ? "Unlock" : "Lock"} ${label}`}
                  title={allLocked ? "Unlock" : "Lock"}
                  disabled={!actions.canEdit}
                  onClick={() => toggleShapes(unit.ids, "locked", !allLocked)}
                >
                  {allLocked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
                </button>
              </div>
              {isGroup && !collapsed && (
                <div role="group" aria-label={`${label} members`}>
                  {unit.members.map(renderMember)}
                </div>
              )}
              {isFrame && !collapsed && renderFrameChildren(unit.members[0]!.id)}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

const LayersPanel = () => <LayersPanelView actions={useEditorActions()} />;

export default LayersPanel;
