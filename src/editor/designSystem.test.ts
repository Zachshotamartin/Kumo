import type { Shape } from "../classes/shape";
import {
  applySharedStyle,
  bindVariable,
  createComponent,
  createSharedStyle,
  createVariable,
  createVariantSet,
  detachInstance,
  documentResources,
  componentDefinitions,
  instantiateComponent,
  patchInstanceAware,
  resetInstance,
  resolveVariables,
  swapInstanceVariant,
  synchronizeComponentInstances,
} from "./designSystem";

const shape = (id: string, x: number, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: x, y1: 0, x2: x + 20, y2: 20,
  width: 20, height: 20, level: 0, zIndex: x + 1, parentId: null, backgroundColor: "#fff", ...patch,
});

describe("components, variants, styles, and variables", () => {
  it("discovers document resources and component definitions", () => {
    const resource = shape("resource", 0, { type: "resource", resourceKind: "color-variable", resourceValue: { value: "#fff" } });
    const incompleteResource = shape("incomplete", 0, { type: "resource" });
    const component = shape("component", 0, { componentDefinition: true });
    expect(documentResources([resource, incompleteResource, component])).toEqual([resource]);
    expect(componentDefinitions([resource, incompleteResource, component])).toEqual([component]);
  });

  it("handles empty and multi-layer component creation", () => {
    const first = shape("first", 0);
    const second = shape("second", 30);
    expect(createComponent([first], [])).toEqual({ shapes: [first], componentId: null });

    const created = createComponent([first, second], [first.id, second.id]);
    const frame = created.shapes.find((item) => item.id === created.componentId)!;
    expect(frame).toMatchObject({ type: "frame", name: "Component", componentDefinition: true });
    expect(created.shapes.filter((item) => item.parentId === frame.id)).toHaveLength(2);

    const parentA = shape("parent-a", 0, { type: "frame" });
    const parentB = shape("parent-b", 50, { type: "frame" });
    const childA = shape("child-a", 5, { parentId: parentA.id });
    const childB = shape("child-b", 55, { parentId: parentB.id });
    expect(createComponent([parentA, parentB, childA, childB], [childA.id, childB.id])).toEqual({
      shapes: [parentA, parentB, childA, childB],
      componentId: null,
    });
  });

  it("creates a component tree and an independently positioned synchronized instance", () => {
    const frame = shape("frame", 0, { type: "frame" });
    const child = shape("child", 5, { parentId: frame.id, backgroundColor: "#f00" });
    const component = createComponent([frame, child], [frame.id], "Button");
    const instance = instantiateComponent(component.shapes, component.componentId!, { x: 100, y: 50 });
    expect(instance.shapes.find((item) => item.id === instance.instanceId)).toMatchObject({ instanceOf: frame.id, x1: 100, y1: 50 });
    const instanceChild = instance.shapes.find((item) => item.componentNodeId === child.id)!;
    expect(instanceChild).toMatchObject({ x1: 105, y1: 50, backgroundColor: "#f00" });

    const changed = instance.shapes.map((item) => item.id === child.id ? { ...item, backgroundColor: "#0f0" } : item);
    expect(synchronizeComponentInstances(changed).find((item) => item.id === instanceChild.id)?.backgroundColor).toBe("#0f0");
  });

  it("preserves overrides, resets them, and detaches instances", () => {
    const component = createComponent([shape("source", 0)], ["source"]);
    const created = instantiateComponent(component.shapes, "source");
    const patched = patchInstanceAware(created.shapes, [created.instanceId!], { backgroundColor: "#123456" });
    expect(synchronizeComponentInstances(patched).find((item) => item.id === created.instanceId)?.backgroundColor).toBe("#123456");
    expect(resetInstance(patched, created.instanceId!).find((item) => item.id === created.instanceId)?.backgroundColor).toBe("#fff");
    expect(detachInstance(patched, created.instanceId!).find((item) => item.id === created.instanceId)?.instanceOf).toBeUndefined();
  });

  it("creates variant sets and swaps an instance between compatible variants", () => {
    const first = { ...shape("first", 0), componentDefinition: true, componentName: "Default" };
    const second = { ...shape("second", 40), componentDefinition: true, componentName: "Hover", backgroundColor: "#000" };
    const variants = createVariantSet([first, second], [first.id, second.id]);
    const instance = instantiateComponent(variants.shapes, first.id);
    const swapped = swapInstanceVariant(instance.shapes, instance.instanceId!, second.id);
    expect(swapped.find((item) => item.id === instance.instanceId)).toMatchObject({ instanceOf: second.id, backgroundColor: "#000" });
  });

  it("numbers unnamed variants within the selected set and keeps existing properties", () => {
    const unrelated = shape("unrelated", 0);
    const first = shape("first", 20, { componentDefinition: true, componentName: undefined, variantProperties: { Size: "S" } });
    const second = shape("second", 40, { componentDefinition: true, componentName: undefined });
    expect(createVariantSet([unrelated, first], [first.id])).toEqual({ shapes: [unrelated, first], componentSetId: null });
    const variants = createVariantSet([unrelated, first, second], [first.id, second.id], "Mode");
    expect(variants.shapes.find((item) => item.id === unrelated.id)).toBe(unrelated);
    expect(variants.shapes.find((item) => item.id === first.id)?.variantProperties).toEqual({ Size: "S", Mode: "Variant 1" });
    expect(variants.shapes.find((item) => item.id === second.id)?.variantProperties).toEqual({ Mode: "Variant 2" });
  });

  it("rejects missing components and translates vector, boolean, and external references", () => {
    const untouched = [shape("plain", 0)];
    expect(instantiateComponent(untouched, "missing")).toEqual({ shapes: untouched, instanceId: null });

    const root = shape("root", 10, {
      type: "frame",
      name: undefined,
      componentDefinition: true,
      componentName: undefined,
      parentId: undefined,
    });
    const child = shape("vector", 15, {
      parentId: root.id,
      vectorPoints: [
        { id: "one", x: 15, y: 2, handleIn: { x: 14, y: 1 }, handleOut: { x: 16, y: 3 } },
        { id: "two", x: 20, y: 4 },
      ],
      booleanChildren: [shape("nested", 16, { vectorPoints: [{ id: "nested-point", x: 16, y: 3 }] })],
      maskId: "external-mask",
      sectionId: "external-section",
      prototypeInteractions: [
        { id: "external", trigger: "click", action: "navigate", destinationId: "external-destination" },
        { id: "back", trigger: "click", action: "back" },
      ],
    });
    const created = instantiateComponent([root, child], root.id);
    const instanceRoot = created.shapes.find((item) => item.id === created.instanceId)!;
    const instanceChild = created.shapes.find((item) => item.instanceRootId === created.instanceId && item.componentNodeId === child.id)!;
    expect(instanceRoot).toMatchObject({ name: "Component instance", x1: 78, parentId: null });
    expect(instanceChild).toMatchObject({
      x1: 83,
      maskId: "external-mask",
      sectionId: "external-section",
      vectorPoints: [
        { id: "one", x: 83, y: 2, handleIn: { x: 82, y: 1 }, handleOut: { x: 84, y: 3 } },
        { id: "two", x: 88, y: 4 },
      ],
    });
    expect(instanceChild.booleanChildren?.[0]).toMatchObject({ x1: 84, x2: 104, vectorPoints: [{ id: "nested-point", x: 84, y: 3 }] });
    expect(instanceChild.prototypeInteractions).toEqual([
      expect.objectContaining({ destinationId: "external-destination" }),
      expect.objectContaining({ destinationId: undefined }),
    ]);
  });

  it("keeps a component instance beside its nested definition", () => {
    const container = shape("container", 0, { type: "frame" });
    const component = shape("component", 5, { parentId: container.id, componentDefinition: true });
    const created = instantiateComponent([container, component], component.id, { x: 80, y: 20 });
    expect(created.shapes.find((item) => item.id === created.instanceId)?.parentId).toBe(container.id);
  });

  it("adds and removes instance children when the component structure changes", () => {
    const frame = shape("component", 0, { type: "frame" });
    const component = createComponent([frame], [frame.id], "Card");
    const instance = instantiateComponent(component.shapes, frame.id, { x: 100, y: 100 });
    const addedSource = shape("new-child", 5, { name: "Label", parentId: frame.id, backgroundColor: "#f00" });
    const withChild = synchronizeComponentInstances([...instance.shapes, addedSource]);
    const instanceChild = withChild.find((item) => item.instanceRootId === instance.instanceId && item.componentNodeId === addedSource.id);
    expect(instanceChild).toMatchObject({ parentId: instance.instanceId, x1: 105, y1: 100, backgroundColor: "#f00" });
    const withoutChild = synchronizeComponentInstances(withChild.filter((item) => item.id !== addedSource.id));
    expect(withoutChild.find((item) => item.id === instanceChild?.id)).toBeUndefined();
  });

  it("synchronizes component layer reordering without moving the instance stack", () => {
    const frame = shape("component", 0, { type: "frame", zIndex: 1 });
    const background = shape("background", 2, { parentId: frame.id, zIndex: 2 });
    const label = shape("label", 4, { parentId: frame.id, type: "text", zIndex: 3 });
    const component = createComponent([frame, background, label], [frame.id], "Card");
    const instance = instantiateComponent(component.shapes, frame.id, { x: 100, y: 100 });
    const before = instance.shapes.filter((item) => item.instanceRootId === instance.instanceId);
    const baseZ = Math.min(...before.map((item) => item.zIndex));
    const reorderedDefinition = instance.shapes.map((item) => item.id === background.id
      ? { ...item, zIndex: 4 }
      : item.id === label.id ? { ...item, zIndex: 2 } : item);
    const synchronized = synchronizeComponentInstances(reorderedDefinition);
    const instanceBackground = synchronized.find((item) => item.instanceRootId === instance.instanceId && item.componentNodeId === background.id)!;
    const instanceLabel = synchronized.find((item) => item.instanceRootId === instance.instanceId && item.componentNodeId === label.id)!;
    const instanceRoot = synchronized.find((item) => item.id === instance.instanceId)!;

    expect(instanceRoot.zIndex).toBe(baseZ);
    expect(instanceLabel.zIndex).toBe(baseZ + 1);
    expect(instanceBackground.zIndex).toBe(baseZ + 2);
  });

  it("keeps masks, sections, and prototype destinations internal to synchronized instances", () => {
    const frame = shape("component", 0, { type: "frame" });
    const mask = shape("mask", 2, { parentId: frame.id, type: "ellipse", isMask: true });
    const target = shape("target", 5, {
      parentId: frame.id,
      maskId: mask.id,
      sectionId: mask.id,
      prototypeInteractions: [{ id: "go", trigger: "click", action: "navigate", destinationId: mask.id }],
    });
    const component = createComponent([frame, mask, target], [frame.id], "Linked card");
    const created = instantiateComponent(component.shapes, frame.id, { x: 100, y: 80 });
    const synchronized = synchronizeComponentInstances(created.shapes);
    const instanceMask = synchronized.find((item) => item.instanceRootId === created.instanceId && item.componentNodeId === mask.id)!;
    const instanceTarget = synchronized.find((item) => item.instanceRootId === created.instanceId && item.componentNodeId === target.id)!;
    expect(instanceTarget).toMatchObject({ maskId: instanceMask.id, sectionId: instanceMask.id });
    expect(instanceTarget.prototypeInteractions?.[0]?.destinationId).toBe(instanceMask.id);
  });

  it("ignores invalid instance roots and synchronizes root size and vector overrides", () => {
    const invalidRoot = shape("invalid-instance", 50, { instanceOf: "missing", instanceRootId: "invalid-instance" });
    expect(synchronizeComponentInstances([invalidRoot])).toEqual([invalidRoot]);

    const root = shape("component", 0, { type: "frame", componentDefinition: true, width: 20, height: 20 });
    const child = shape("child", 5, {
      parentId: root.id,
      vectorPoints: [{ id: "point", x: 5, y: 5 }],
      booleanChildren: [shape("boolean", 6)],
    });
    const created = instantiateComponent([root, child], root.id, { x: 100, y: 100 });
    const instanceRoot = created.shapes.find((item) => item.id === created.instanceId)!;
    const instanceChild = created.shapes.find((item) => item.instanceRootId === created.instanceId && item.componentNodeId === child.id)!;
    const withOverrides = created.shapes.map((item) => item.id === instanceRoot.id
      ? { ...item, width: 60, height: 70, x2: 160, y2: 170, overriddenFields: ["width", "height"] }
      : item.id === instanceChild.id
        ? { ...item, vectorPoints: [{ id: "custom", x: 999, y: 999 }], booleanChildren: [], overriddenFields: ["vectorPoints", "booleanChildren"] }
        : item.id === child.id
          ? { ...item, vectorPoints: [{ id: "point", x: 8, y: 8 }], booleanChildren: [shape("updated", 9)] }
          : item);
    const synchronized = synchronizeComponentInstances(withOverrides);
    expect(synchronized.find((item) => item.id === instanceRoot.id)).toMatchObject({ width: 60, height: 70, x1: 100, y1: 100 });
    expect(synchronized.find((item) => item.id === instanceChild.id)).toMatchObject({
      vectorPoints: [{ id: "custom", x: 999, y: 999 }],
      booleanChildren: [],
    });
  });

  it("synchronizes external references and destination-free interactions", () => {
    const root = shape("component", 0, { type: "frame", componentDefinition: true });
    const child = shape("child", 5, {
      name: undefined,
      parentId: root.id,
      maskId: "external-mask",
      sectionId: "external-section",
      prototypeInteractions: [
        { id: "external", trigger: "click", action: "navigate", destinationId: "external-destination" },
        { id: "back", trigger: "click", action: "back" },
      ],
    });
    const created = instantiateComponent([root, child], root.id, { x: 100, y: 100 });
    const synchronized = synchronizeComponentInstances(created.shapes);
    const instanceChild = synchronized.find((item) => item.instanceRootId === created.instanceId && item.componentNodeId === child.id)!;
    expect(instanceChild).toMatchObject({ maskId: "external-mask", sectionId: "external-section" });
    expect(instanceChild.prototypeInteractions).toEqual([
      expect.objectContaining({ destinationId: "external-destination" }),
      expect.objectContaining({ destinationId: undefined }),
    ]);
  });

  it("translates vector data for newly synchronized nodes and removes invalid instance nodes", () => {
    const root = shape("component", 0, { type: "frame", componentDefinition: true });
    const created = instantiateComponent([root], root.id, { x: 100, y: 100 });
    const newChild = shape("new-child", 5, {
      parentId: root.id,
      vectorPoints: [{ id: "point", x: 6, y: 7 }],
      booleanChildren: [shape("nested", 8)],
    });
    const invalid = shape("invalid", 200, { instanceRootId: created.instanceId! });
    const obsolete = shape("obsolete", 220, { instanceRootId: created.instanceId!, componentNodeId: "removed-source" });
    const synchronized = synchronizeComponentInstances([...created.shapes, newChild, invalid, obsolete]);
    const added = synchronized.find((item) => item.instanceRootId === created.instanceId && item.componentNodeId === newChild.id)!;
    expect(added.vectorPoints).toEqual([{ id: "point", x: 106, y: 107 }]);
    expect(added.booleanChildren?.[0]).toMatchObject({ x1: 108, x2: 128 });
    expect(synchronized.some((item) => item.id === invalid.id || item.id === obsolete.id)).toBe(false);
  });

  it("maps matching nested layers when swapping variants and preserves overrides", () => {
    const first = shape("first", 0, { type: "frame", componentDefinition: true, componentName: "Default" });
    const firstLabel = shape("first-label", 5, { name: "Label", type: "text", parentId: first.id, text: "Default" });
    const second = shape("second", 40, { type: "frame", componentDefinition: true, componentName: "Hover" });
    const secondLabel = shape("second-label", 45, { name: "Label", type: "text", parentId: second.id, text: "Hover", color: "#0f0" });
    const variants = createVariantSet([first, firstLabel, second, secondLabel], [first.id, second.id]);
    const instance = instantiateComponent(variants.shapes, first.id);
    const instanceLabel = instance.shapes.find((item) => item.instanceRootId === instance.instanceId && item.componentNodeId === firstLabel.id)!;
    const overridden = patchInstanceAware(instance.shapes, [instanceLabel.id], { text: "Custom" });
    const swapped = swapInstanceVariant(overridden, instance.instanceId!, second.id);
    expect(swapped.find((item) => item.id === instanceLabel.id)).toMatchObject({
      componentNodeId: secondLabel.id,
      text: "Custom",
      color: "#0f0",
    });
  });

  it("leaves invalid or incompatible variant swaps unchanged", () => {
    const plain = shape("plain", 0);
    const component = shape("component", 30, { componentDefinition: true });
    const setA = shape("set-a", 60, { componentDefinition: true, componentSetId: "a" });
    const setB = shape("set-b", 90, { componentDefinition: true, componentSetId: "b" });
    const instance = shape("instance", 120, { instanceOf: setA.id, instanceRootId: "instance" });
    const document = [plain, component, setA, setB, instance];
    expect(swapInstanceVariant(document, "missing", component.id)).toBe(document);
    expect(swapInstanceVariant(document, instance.id, "missing")).toBe(document);
    expect(swapInstanceVariant(document, instance.id, component.id)).toBe(document);
    expect(swapInstanceVariant(document, instance.id, setB.id)).toBe(document);
  });

  it("drops unmatched layers while swapping variants and deterministically maps tied layers", () => {
    const first = shape("first", 0, { type: "frame", componentDefinition: true, componentSetId: "set" });
    const firstA = shape("a", 3, { name: "A", parentId: first.id, zIndex: 2 });
    const firstB = shape("b", 5, { name: undefined, parentId: first.id, zIndex: 2 });
    const second = shape("second", 40, { type: "frame", componentDefinition: true, componentSetId: "set" });
    const secondA = shape("second-a", 43, { name: "A", parentId: second.id, zIndex: 42 });
    const created = instantiateComponent([first, firstB, firstA, second, secondA], first.id);
    const nonInstance = shape("outside", 200, { componentNodeId: first.id });
    const swapped = swapInstanceVariant([...created.shapes, nonInstance], created.instanceId!, second.id);
    expect(swapped).toContain(nonInstance);
    expect(swapped.some((item) => item.instanceRootId === created.instanceId && item.componentNodeId === secondA.id)).toBe(true);
    expect(swapped.some((item) => item.instanceRootId === created.instanceId && item.componentNodeId === firstB.id)).toBe(false);
  });

  it("tracks the first override on an instance that has no override list", () => {
    const instance = shape("instance", 0, { instanceOf: "component", instanceRootId: "instance", overriddenFields: undefined });
    expect(patchInstanceAware([instance], [instance.id], { opacity: 0.25 })[0]).toMatchObject({
      opacity: 0.25,
      overriddenFields: ["opacity"],
    });
  });

  it("creates and applies shared styles", () => {
    const source = shape("source", 0, { backgroundColor: "#b87a2e", opacity: 0.5 });
    const target = shape("target", 30);
    const style = createSharedStyle([source, target], source, "fill-style", "Brand fill");
    const applied = applySharedStyle(style.shapes, [target.id], style.styleId);
    expect(applied.find((item) => item.id === target.id)).toMatchObject({ backgroundColor: "#b87a2e", opacity: 0.5, fillStyleId: style.styleId });
  });

  it.each([
    ["fill-style", { backgroundColor: undefined, opacity: undefined }, { backgroundColor: "transparent", opacity: 1, fillStyleId: expect.any(String) }],
    ["text-style", {}, { color: "#ffffff", fontSize: 18, fontFamily: "Arial", fontWeight: "normal", lineHeight: 1.2, letterSpacing: 0, textStyleId: expect.any(String) }],
    ["effect-style", {}, { borderColor: "transparent", borderWidth: 0, borderRadius: 0, effectStyleId: expect.any(String) }],
  ] as const)("creates and applies default %s values", (kind, patch, expected) => {
    const source = shape("source", 0, patch);
    const target = shape("target", 20);
    const style = createSharedStyle([source, target], source, kind, "Style");
    expect(applySharedStyle(style.shapes, [target.id], style.styleId).find((item) => item.id === target.id)).toMatchObject(expected);
  });

  it("uses explicit text and effect style values and rejects missing styles", () => {
    const source = shape("source", 0, {
      color: "#123", fontSize: 22, fontFamily: "Inter", fontWeight: "700", lineHeight: 1.5, letterSpacing: 2,
      borderColor: "#456", borderWidth: 3, borderRadius: 7,
    });
    const target = shape("target", 30);
    const text = createSharedStyle([source, target], source, "text-style", "Type");
    expect(applySharedStyle(text.shapes, [target.id], text.styleId).find((item) => item.id === target.id)).toMatchObject({ color: "#123", fontSize: 22, fontFamily: "Inter", fontWeight: "700", lineHeight: 1.5, letterSpacing: 2 });
    const effect = createSharedStyle(text.shapes, source, "effect-style", "Effect");
    expect(applySharedStyle(effect.shapes, [target.id], effect.styleId).find((item) => item.id === target.id)).toMatchObject({ borderColor: "#456", borderWidth: 3, borderRadius: 7 });
    expect(applySharedStyle([source, target], [target.id], "missing")).toEqual([source, target]);
    expect(applySharedStyle([...text.shapes, shape("malformed", 50, { type: "resource", resourceValue: { value: 1 } })], [target.id], "malformed")).toHaveLength(4);
  });

  it("binds properties to reusable variables and resolves later value changes", () => {
    const target = shape("target", 0);
    const variable = createVariable([target], "color-variable", "Brand", "#b87a2e");
    const bound = bindVariable(variable.shapes, [target.id], "backgroundColor", variable.variableId);
    const updated = bound.map((item) => item.id === variable.variableId ? { ...item, resourceValue: { value: "#ffffff" } } : item);
    expect(resolveVariables(updated).find((item) => item.id === target.id)?.backgroundColor).toBe("#ffffff");
  });

  it("validates variable bindings, preserves existing bindings, and ignores missing resolutions", () => {
    const target = shape("target", 0, { variableBindings: { color: "old" } });
    const color = createVariable([target], "color-variable", "Color", "#abc");
    const number = createVariable(color.shapes, "number-variable", "Radius", 12);
    expect(bindVariable(number.shapes, [target.id], "backgroundColor", number.variableId)).toBe(number.shapes);
    expect(bindVariable(number.shapes, [target.id], "opacity", color.variableId)).toBe(number.shapes);
    expect(bindVariable(number.shapes, [target.id], "borderRadius", "missing")).toBe(number.shapes);

    const boundColor = bindVariable(number.shapes, [target.id], "backgroundColor", color.variableId);
    expect(boundColor.find((item) => item.id === target.id)).toMatchObject({
      backgroundColor: "#abc",
      variableBindings: { color: "old", backgroundColor: color.variableId },
    });
    const boundRadius = bindVariable(boundColor, [target.id], "borderRadius", number.variableId);
    expect(boundRadius.find((item) => item.id === target.id)?.borderRadius).toBe(12);
    expect(bindVariable(boundRadius, ["unselected"], "color", color.variableId).find((item) => item.id === target.id)).toBe(boundRadius.find((item) => item.id === target.id));

    const missing = shape("missing-binding", 80, { variableBindings: { opacity: "gone" }, opacity: 0.5 });
    const plain = shape("plain", 100);
    const resolved = resolveVariables([...boundRadius, missing, plain]);
    expect(resolved.find((item) => item.id === missing.id)?.opacity).toBe(0.5);
    expect(resolved.find((item) => item.id === plain.id)).toBe(plain);
  });
});
