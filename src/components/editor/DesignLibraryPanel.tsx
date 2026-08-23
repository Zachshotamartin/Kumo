import { Copy, DiamondsFour, Palette, Plus, SlidersHorizontal, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { componentDefinitions, documentResources } from "../../editor/designSystem";
import { useEditorActions } from "../../editor/useEditorActions";
import { setRightPanel } from "../../features/editor/editorSlice";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const DesignLibraryPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const actions = useEditorActions();
  const [name, setName] = useState("Brand");
  const [color, setColor] = useState("#b87a2e");
  const components = useMemo(() => componentDefinitions(board.shapes), [board.shapes]);
  const resources = useMemo(() => documentResources(board.shapes), [board.shapes]);
  const selected = board.shapes.find((shape) => selectedIds.includes(shape.id));
  const selectedInstance = board.shapes.find((shape) => selectedIds.includes(shape.id) && shape.instanceRootId === shape.id);
  const sourceComponent = selectedInstance?.instanceOf
    ? board.shapes.find((shape) => shape.id === selectedInstance.instanceOf)
    : undefined;
  const compatibleVariants = sourceComponent?.componentSetId
    ? components.filter((component) => component.componentSetId === sourceComponent.componentSetId)
    : [];

  return (
    <aside className={styles.inspectorPanel} aria-label="Assets">
      <div className={styles.panelHeading}>
        <span>Assets</span>
        <button type="button" aria-label="Close assets" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button>
      </div>
      <div className={styles.inspectorBody}>
        <section className={styles.inspectorSection}>
          <h2>Components</h2>
          <button type="button" disabled={!selected || !actions.canEdit} onClick={() => actions.createComponentSelected(name)}>
            <DiamondsFour aria-hidden="true" /> Create from selection
          </button>
          <button type="button" disabled={selectedIds.length < 2 || !actions.canEdit} onClick={actions.createVariantSetSelected}>
            <SlidersHorizontal aria-hidden="true" /> Combine as variants
          </button>
          {components.length === 0 && <p className={styles.fieldHint}>Create a component from a selected object or frame.</p>}
          <div className={styles.assetList}>
            {components.map((component) => (
              <div className={styles.assetRow} key={component.id}>
                <span><DiamondsFour aria-hidden="true" /> {component.componentName ?? component.name ?? "Component"}</span>
                <button type="button" aria-label={`Insert ${component.componentName ?? component.name}`} onClick={() => actions.addComponentInstance(component.id)}><Plus aria-hidden="true" /></button>
              </div>
            ))}
          </div>
          {selectedInstance && (
            <div className={styles.assetActions}>
              <button type="button" onClick={actions.resetSelectedInstance}>Reset overrides</button>
              <button type="button" onClick={actions.detachSelectedInstance}>Detach</button>
              {compatibleVariants.length > 1 && (
                <label className={styles.fullField}>
                  <span>Variant</span>
                  <select value={selectedInstance.instanceOf} onChange={(event) => actions.swapSelectedVariant(event.target.value)}>
                    {compatibleVariants.map((variant) => <option value={variant.id} key={variant.id}>{Object.values(variant.variantProperties ?? {}).join(" / ") || variant.componentName}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
        </section>

        <section className={styles.inspectorSection}>
          <h2>Shared styles</h2>
          <label className={styles.fullField}><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <div className={styles.buttonGrid}>
            <button type="button" disabled={!selected} onClick={() => actions.createStyleFromSelected("fill-style", `${name} fill`)}><Palette aria-hidden="true" /> Fill</button>
            <button type="button" disabled={selected?.type !== "text"} onClick={() => actions.createStyleFromSelected("text-style", `${name} text`)}>Text</button>
            <button type="button" disabled={!selected} onClick={() => actions.createStyleFromSelected("effect-style", `${name} effect`)}>Effect</button>
          </div>
          <div className={styles.assetList}>
            {resources.filter((resource) => resource.resourceKind?.endsWith("style")).map((resource) => (
              <button className={styles.assetApply} type="button" key={resource.id} disabled={!selected} onClick={() => actions.applyStyleToSelected(resource.id)}>
                <Copy aria-hidden="true" /> {resource.resourceName}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.inspectorSection}>
          <h2>Variables</h2>
          <label className={styles.colorField}>
            <span>Color</span>
            <span className={styles.colorControl}><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><input aria-label="Variable color" value={color} onChange={(event) => setColor(event.target.value)} /></span>
          </label>
          <button type="button" onClick={() => actions.createLibraryVariable("color-variable", `${name} color`, color)}><Plus aria-hidden="true" /> Add color variable</button>
          <div className={styles.assetList}>
            {resources.filter((resource) => resource.resourceKind === "color-variable").map((resource) => (
              <div className={styles.assetRow} key={resource.id}>
                <span><i style={{ background: String(resource.resourceValue?.value) }} />{resource.resourceName}</span>
                <div>
                  <button type="button" disabled={!selected} aria-label={`Bind ${resource.resourceName} to fill`} onClick={() => actions.bindVariableToSelected("backgroundColor", resource.id)}>Fill</button>
                  {selected?.type === "text" && <button type="button" aria-label={`Bind ${resource.resourceName} to text`} onClick={() => actions.bindVariableToSelected("color", resource.id)}>Text</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
};

export default DesignLibraryPanel;
