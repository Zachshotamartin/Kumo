import { Command, MagnifyingGlass } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { shapeBounds } from "../../editor/geometry";
import { documentPages, pageIdForShape } from "../../editor/workspace";
import { useEditorActions } from "../../editor/useEditorActions";
import { setCurrentPageId, setRightPanel, setViewport } from "../../features/editor/editorSlice";
import { setSelectedShapes, setSelectedTool } from "../../features/selected/selectedSlice";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

interface PaletteItem {
  id: string;
  label: string;
  detail: string;
  keywords: string;
  run: () => void;
}

const CommandPalette = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const editor = useSelector((state: RootState) => state.editor);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const actions = useEditorActions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p")) {
        event.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openPalette]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const pages = documentPages(board.shapes);
    const panel = (id: "properties" | "assets" | "prototype" | "comments" | "history" | "export" | "inspect" | "branches" | "platform", label: string): PaletteItem => ({
      id: `panel-${id}`, label, detail: "Panel", keywords: `${label} panel sidebar`, run: () => dispatch(setRightPanel(id)),
    });
    const tool = (id: "pointer" | "frame" | "rectangle" | "ellipse" | "pen" | "text" | "image" | "board" | "comment", label: string): PaletteItem => ({
      id: `tool-${id}`, label, detail: "Tool", keywords: `${label} draw create tool`, run: () => dispatch(setSelectedTool(id)),
    });
    return [
      ...board.shapes.filter((shape) => !shape.hidden && !["resource", "guide", "page-resource", "collection-resource"].includes(shape.type)).map((shape): PaletteItem => ({
        id: `shape-${shape.id}`,
        label: shape.name ?? shape.type,
        detail: shape.parentId ? `${shape.type} · nested` : shape.type,
        keywords: `${shape.name ?? ""} ${shape.type} ${shape.text ?? ""}`,
        run: () => {
          const bounds = shapeBounds(shape);
          dispatch(setCurrentPageId(pageIdForShape(shape, pages)));
          dispatch(setSelectedShapes([shape.id]));
          dispatch(setViewport({ x: bounds.x + bounds.width / 2 - 500 / editor.viewport.zoom, y: bounds.y + bounds.height / 2 - 350 / editor.viewport.zoom, zoom: editor.viewport.zoom }));
        },
      })),
      panel("properties", "Open properties"), panel("assets", "Open assets"), panel("prototype", "Open prototype"),
      panel("comments", "Open comments"), panel("history", "Open version history"), panel("export", "Open export"), panel("inspect", "Open developer inspect"), panel("branches", "Open design branches"), panel("platform", "Open product tools"),
      tool("pointer", "Select"), tool("frame", "Draw frame"), tool("rectangle", "Draw rectangle"),
      tool("ellipse", "Draw ellipse"), tool("pen", "Draw vector path"), tool("text", "Add text"), tool("image", "Add image"),
      tool("board", "Link a board"), tool("comment", "Add comment"),
      { id: "group", label: "Group selection", detail: "Command", keywords: "group selection", run: actions.groupSelected },
      { id: "frame-selection", label: "Frame selection", detail: "Command", keywords: "frame selection", run: actions.frameSelected },
      { id: "component", label: "Create component", detail: "Command", keywords: "component reusable asset", run: () => actions.createComponentSelected("Component") },
      { id: "zoom-reset", label: "Reset zoom to 100%", detail: "View", keywords: "zoom reset view", run: () => dispatch(setViewport({ ...editor.viewport, zoom: 1 })) },
    ];
  }, [actions, board.shapes, dispatch, editor.viewport]);

  const normalized = query.trim().toLowerCase();
  const results = items
    .filter((item) => !normalized || `${item.label} ${item.keywords}`.toLowerCase().includes(normalized))
    .slice(0, 30);

  const run = (item?: PaletteItem) => {
    if (!item) return;
    item.run();
    setOpen(false);
  };

  return (
    <>
      <button type="button" className={styles.commandButton} aria-label="Search objects and commands" onClick={openPalette}>
        <MagnifyingGlass aria-hidden="true" /><span>Search</span><kbd>⌘K</kbd>
      </button>
      {open && (
        <div className={styles.commandBackdrop} onPointerDown={() => setOpen(false)}>
          <div className={styles.commandPalette} role="dialog" aria-modal="true" aria-label="Search and commands" onPointerDown={(event) => event.stopPropagation()}>
            <label className={styles.commandSearch}>
              <MagnifyingGlass aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                placeholder="Find a layer or run a command"
                aria-label="Search objects and commands"
                onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setOpen(false);
                  if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(results.length - 1, value + 1)); }
                  if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
                  if (event.key === "Enter") { event.preventDefault(); run(results[active]); }
                }}
              />
              <Command aria-hidden="true" />
            </label>
            <div className={styles.commandResults} role="listbox" aria-label="Results">
              {results.map((item, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  key={item.id}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(item)}
                >
                  <span>{item.label}</span><small>{item.detail}</small>
                </button>
              ))}
              {!results.length && <p>No matching objects or commands.</p>}
            </div>
            <footer><span>↑↓ navigate</span><span>↵ run</span><span>esc close</span>{selectedIds.length > 0 && <span>{selectedIds.length} selected</span>}</footer>
          </div>
        </div>
      )}
    </>
  );
};

export default CommandPalette;
