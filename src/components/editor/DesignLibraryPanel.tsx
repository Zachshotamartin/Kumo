import { Copy, DiamondsFour, Palette, Plus, SlidersHorizontal, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { componentDefinitions, documentResources } from "../../editor/designSystem";
import {
  applyComponentProperties,
  createModeVariable,
  createVariableCollection,
  defineComponentProperty,
} from "../../platform/productCapabilities";
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
  const [collectionName, setCollectionName] = useState("Theme");
  const [modes, setModes] = useState("Light, Dark");
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
  const selectedDefinition = selected?.componentDefinition ? selected : undefined;
  const selectedDefinitionChildren = selectedDefinition ? board.shapes.filter((shape) => shape.parentId === selectedDefinition.id) : [];
  const propertyDefinition = selectedInstance?.instanceOf ? board.shapes.find((shape) => shape.id === selectedInstance.instanceOf) : undefined;

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
              {Object.entries(propertyDefinition?.componentProperties ?? {}).map(([key, property]) => (
                <label className={styles.fullField} key={key}>
                  <span>{property.label}</span>
                  {property.type === "boolean"
                    ? <input type="checkbox" checked={Boolean(selectedInstance.instanceProperties?.[key] ?? property.defaultValue)} onChange={(event) => actions.commitShapes(applyComponentProperties(board.shapes, selectedInstance.id, { [key]: event.target.checked }))} />
                    : property.type === "instance-swap" || property.type === "variant"
                      ? <select value={String(selectedInstance.instanceProperties?.[key] ?? property.defaultValue)} onChange={(event) => actions.commitShapes(applyComponentProperties(board.shapes, selectedInstance.id, { [key]: event.target.value }))}>{components.filter((component) => !property.preferredValues?.length || property.preferredValues.includes(component.id)).map((component) => <option key={component.id} value={component.id}>{component.componentName ?? component.name}</option>)}</select>
                      : <input value={String(selectedInstance.instanceProperties?.[key] ?? property.defaultValue)} onChange={(event) => actions.commitShapes(applyComponentProperties(board.shapes, selectedInstance.id, { [key]: event.target.value }))} />}
                </label>
              ))}
            </div>
          )}
          {selectedDefinition && <div className={styles.assetActions}>
            <span className={styles.controlLabel}>Component properties</span>
            <button type="button" disabled={!selectedDefinitionChildren.some((shape) => shape.type === "text")} onClick={() => {
              const target = selectedDefinitionChildren.find((shape) => shape.type === "text");
              if (!target) return;
              actions.commitShapes(board.shapes.map((shape) => shape.id === selectedDefinition.id ? defineComponentProperty(shape, "label", { type: "text", label: "Label", defaultValue: target.text ?? "", targetNodeId: target.id, targetField: "text" }) : shape));
            }}>Expose text</button>
            <button type="button" disabled={!selectedDefinitionChildren.length} onClick={() => {
              const target = selectedDefinitionChildren[0];
              if (!target) return;
              actions.commitShapes(board.shapes.map((shape) => shape.id === selectedDefinition.id ? defineComponentProperty(shape, "visible", { type: "boolean", label: "Show content", defaultValue: !target.hidden, targetNodeId: target.id, targetField: "hidden" }) : shape));
            }}>Expose visibility</button>
            <button type="button" disabled={!selectedDefinitionChildren.some((shape) => shape.instanceOf)} onClick={() => {
              const target = selectedDefinitionChildren.find((shape) => shape.instanceOf);
              if (!target?.instanceOf) return;
              actions.commitShapes(board.shapes.map((shape) => shape.id === selectedDefinition.id ? defineComponentProperty(shape, "nested-instance", { type: "instance-swap", label: "Nested component", defaultValue: target.instanceOf!, targetNodeId: target.id, targetField: "instanceOf", preferredValues: components.map((component) => component.id) }) : shape));
            }}>Expose instance swap</button>
            <button type="button" disabled={!selectedDefinitionChildren.length} onClick={() => {
              const target = selectedDefinitionChildren[0];
              if (!target) return;
              actions.commitShapes(board.shapes.map((shape) => shape.id === selectedDefinition.id ? defineComponentProperty(shape, "slot-content", { type: "slot", label: "Slot content", defaultValue: target.text ?? target.name ?? "", targetNodeId: target.id, targetField: target.type === "text" ? "text" : "name" }) : shape));
            }}>Expose slot</button>
          </div>}
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
          <label className={styles.fullField}><span>Collection</span><input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} /></label>
          <label className={styles.fullField}><span>Modes</span><input value={modes} onChange={(event) => setModes(event.target.value)} /></label>
          <button type="button" onClick={() => {
            const result = createVariableCollection(board.shapes, collectionName, modes.split(",").map((mode) => mode.trim()).filter(Boolean));
            actions.commitShapes(result.shapes);
          }}><Plus aria-hidden="true" /> Add collection</button>
          <label className={styles.colorField}>
            <span>Color</span>
            <span className={styles.colorControl}><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><input aria-label="Variable color" value={color} onChange={(event) => setColor(event.target.value)} /></span>
          </label>
          <button type="button" onClick={() => actions.createLibraryVariable("color-variable", `${name} color`, color)}><Plus aria-hidden="true" /> Add color variable</button>
          {resources.filter((resource) => resource.resourceKind === "variable-collection").map((collection) => {
            const modeEntries = Object.entries(collection.resourceValue ?? {});
            return <div className={styles.assetActions} key={collection.id}><strong>{collection.resourceName}</strong><small>{modeEntries.map(([, mode]) => String(mode)).join(" · ")}</small>{selected && <label className={styles.fullField}><span>Active mode</span><select value={selected.activeVariableModes?.[collection.id] ?? modeEntries[0]?.[0] ?? ""} onChange={(event) => actions.patchSelected({ activeVariableModes: { ...(selected.activeVariableModes ?? {}), [collection.id]: event.target.value } })}>{modeEntries.map(([modeId, mode]) => <option value={modeId} key={modeId}>{String(mode)}</option>)}</select></label>}<button type="button" disabled={!modeEntries.length} onClick={() => {
              const result = createModeVariable(board.shapes, "color-variable", `${name} themed color`, collection.id, Object.fromEntries(modeEntries.map(([modeId], index) => [modeId, index % 2 ? "#17181a" : color])));
              actions.commitShapes(result.shapes);
            }}>Add themed color</button></div>;
          })}
          <div className={styles.assetList}>
            {resources.filter((resource) => resource.resourceKind === "color-variable").map((resource) => (
              <div className={styles.assetRow} key={resource.id}>
                <span><i style={{ background: String(resource.resourceValue?.value) }} />{resource.resourceName}</span>
                <div>
                  <button type="button" disabled={!selected} aria-label={`Bind ${resource.resourceName} to fill`} onClick={() => actions.bindVariableToSelected("backgroundColor", resource.id)}>Fill</button>
                  {selected?.type === "text" && <button type="button" aria-label={`Bind ${resource.resourceName} to text`} onClick={() => actions.bindVariableToSelected("color", resource.id)}>Text</button>}
                </div>
                <label className={styles.fullField}><span>Alias</span><select value={resource.variableAliasId ?? ""} onChange={(event) => actions.commitShapes(board.shapes.map((shape) => shape.id === resource.id ? { ...shape, variableAliasId: event.target.value || undefined } : shape))}><option value="">No alias</option>{resources.filter((candidate) => candidate.id !== resource.id && candidate.resourceKind === resource.resourceKind).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.resourceName}</option>)}</select></label>
                {resource.variableCollectionId && Object.entries(board.shapes.find((shape) => shape.id === resource.variableCollectionId)?.resourceValue ?? {}).map(([modeId, modeName]) => <label className={styles.colorField} key={modeId}><span>{String(modeName)}</span><span className={styles.colorControl}><input type="color" value={String(resource.variableModeValues?.[modeId] ?? resource.resourceValue?.value ?? "#000000")} onChange={(event) => actions.commitShapes(board.shapes.map((shape) => shape.id === resource.id ? { ...shape, variableModeValues: { ...(shape.variableModeValues ?? {}), [modeId]: event.target.value } } : shape))} /><input aria-label={`${resource.resourceName} ${String(modeName)} value`} value={String(resource.variableModeValues?.[modeId] ?? "")} onChange={(event) => actions.commitShapes(board.shapes.map((shape) => shape.id === resource.id ? { ...shape, variableModeValues: { ...(shape.variableModeValues ?? {}), [modeId]: event.target.value } } : shape))} /></span></label>)}
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
};

export default DesignLibraryPanel;
