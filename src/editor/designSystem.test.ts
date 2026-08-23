import type { Shape } from "../classes/shape";
import {
  applySharedStyle,
  bindVariable,
  createComponent,
  createSharedStyle,
  createVariable,
  createVariantSet,
  detachInstance,
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

  it("creates and applies shared styles", () => {
    const source = shape("source", 0, { backgroundColor: "#b87a2e", opacity: 0.5 });
    const target = shape("target", 30);
    const style = createSharedStyle([source, target], source, "fill-style", "Brand fill");
    const applied = applySharedStyle(style.shapes, [target.id], style.styleId);
    expect(applied.find((item) => item.id === target.id)).toMatchObject({ backgroundColor: "#b87a2e", opacity: 0.5, fillStyleId: style.styleId });
  });

  it("binds properties to reusable variables and resolves later value changes", () => {
    const target = shape("target", 0);
    const variable = createVariable([target], "color-variable", "Brand", "#b87a2e");
    const bound = bindVariable(variable.shapes, [target.id], "backgroundColor", variable.variableId);
    const updated = bound.map((item) => item.id === variable.variableId ? { ...item, resourceValue: { value: "#ffffff" } } : item);
    expect(resolveVariables(updated).find((item) => item.id === target.id)?.backgroundColor).toBe("#ffffff");
  });
});
