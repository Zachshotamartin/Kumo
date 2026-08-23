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
