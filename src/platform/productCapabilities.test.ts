import type { Shape } from "../classes/shape";
import {
  analyzeBoardGraph,
  applyComponentProperties,
  applyLibraryUpdate,
  applyTextRun,
  auditAccessibility,
  branchVectorPath,
  contrastRatio,
  createModeVariable,
  createVariableCollection,
  defineComponentProperty,
  dependencyImpact,
  diffLibraryAssets,
  fontFeatureCss,
  fontVariationCss,
  mediaCropCss,
  mediaFilterCss,
  normalizeTextRuns,
  prototypeConditionMatches,
  publishableLibraryAssets,
  replaceDocumentText,
  replaceTextAndRemapRuns,
  resolveVariableModes,
  runExtensionCommand,
  searchDocument,
  splitVectorPath,
  textSegments,
  validateExtensionManifest,
  validateVectorNetwork,
  type ExtensionManifest,
} from "./productCapabilities";

const shape = (id: string, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: 0, y1: 0, x2: 100, y2: 60,
  width: 100, height: 60, level: 0, zIndex: 1, parentId: null, ...patch,
});

describe("product completeness algorithms", () => {
  it("normalizes a board graph, backlinks, broken access, and deletion impact", () => {
    const nodes = [
      { id: "a", title: "A", visibility: "private" as const, accessible: true, manageable: true },
      { id: "b", title: "B", visibility: "private" as const, accessible: false, manageable: false },
    ];
    const graph = analyzeBoardGraph("a", nodes, [
      { sourceId: "a", targetId: "b" }, { sourceId: "a", targetId: "b" }, { sourceId: "missing", targetId: "a" },
    ]);
    expect(graph.edges).toHaveLength(2);
    expect(graph.incoming).toEqual([{ sourceId: "missing", targetId: "a" }]);
    expect(graph.broken).toEqual([{ sourceId: "a", targetId: "b" }]);
    expect(dependencyImpact("a", graph)).toEqual({ incomingBoardIds: ["missing"], outgoingBoardIds: ["b"], brokenAfterDelete: 1 });
  });

  it("applies, merges, clips, and remaps character-level rich text runs", () => {
    const text = shape("text", { type: "text", text: "Hello world", textRuns: [
      { id: "outside", start: -2, end: 5, fontWeight: "bold" },
      { id: "overlap", start: 3, end: 8, color: "#ff0000" },
      { id: "invalid", start: 20, end: 30, color: "#000000" },
    ] });
    expect(normalizeTextRuns(text.text!, text.textRuns!)).toMatchObject([
      { start: 0, end: 5, fontWeight: "bold" }, { start: 5, end: 8, color: "#ff0000" },
    ]);
    const applied = applyTextRun(text, 6, 11, { color: "#00ff00", textDecoration: "underline" });
    expect(textSegments(applied).map((segment) => segment.text).join("")).toBe("Hello world");
    expect(textSegments(applied).at(-1)?.style).toMatchObject({ color: "#00ff00", textDecoration: "underline" });
    expect(applyTextRun(text, 2, 2, { color: "#fff" })).toBe(text);
    expect(replaceTextAndRemapRuns(applied, "Hi").textRuns?.every((run) => run.end <= 2)).toBe(true);
    expect(replaceDocumentText([text], "world", "Kumo")[0]?.text).toBe("Hello Kumo");
    expect(replaceDocumentText([text], "", "ignored")).toEqual([text]);
  });

  it("creates collections, resolves modes and aliases, and prevents alias cycles", () => {
    const target = shape("target", { variableBindings: { backgroundColor: "alias" } });
    const collectionResult = createVariableCollection([target], "Theme", ["Light", "Dark"]);
    expect(collectionResult.resource.id).toBe(collectionResult.collectionId);
    const modes = Object.keys(collectionResult.resource.resourceValue ?? {});
    const variableResult = createModeVariable(collectionResult.shapes, "color-variable", "Brand", collectionResult.collectionId, { [modes[0]!]: "#ffffff", [modes[1]!]: "#000000" });
    const primary = variableResult.shapes.find((candidate) => candidate.id === variableResult.variableId)!;
    const alias = shape("alias", {
      type: "resource", hidden: true, resourceKind: "color-variable", resourceName: "Alias", resourceValue: { value: "#ff0000" }, variableAliasId: primary.id,
    });
    const dark = resolveVariableModes([...variableResult.shapes, alias], { [collectionResult.collectionId]: modes[1]! });
    expect(dark.find((candidate) => candidate.id === "target")?.backgroundColor).toBe("#000000");
    const cyclic = dark.map((candidate) => candidate.id === primary.id ? { ...candidate, variableAliasId: alias.id } : candidate);
    expect(resolveVariableModes(cyclic, {})[0]?.backgroundColor).toBe("#000000");
  });

  it("defines and applies text, boolean, instance-swap, and slot component properties", () => {
    let definition = shape("definition", { componentDefinition: true });
    definition = defineComponentProperty(definition, "label", { type: "text", label: "Label", defaultValue: "Default", targetNodeId: "source-label" });
    definition = defineComponentProperty(definition, "visible", { type: "boolean", label: "Visible", defaultValue: true, targetNodeId: "source-label" });
    definition = defineComponentProperty(definition, "icon", { type: "instance-swap", label: "Icon", defaultValue: "icon-a", targetNodeId: "source-icon" });
    definition = defineComponentProperty(definition, "slot", { type: "slot", label: "Slot", defaultValue: "Body", targetNodeId: "source-slot", targetField: "name" });
    const root = shape("instance", { instanceOf: definition.id, instanceRootId: "instance" });
    const label = shape("label", { type: "text", instanceRootId: root.id, componentNodeId: "source-label" });
    const icon = shape("icon", { instanceRootId: root.id, componentNodeId: "source-icon" });
    const slot = shape("slot", { instanceRootId: root.id, componentNodeId: "source-slot" });
    const applied = applyComponentProperties([definition, root, label, icon, slot], root.id, { label: "Save", visible: false, icon: "icon-b", slot: "Content" });
    expect(applied.find((candidate) => candidate.id === "label")).toMatchObject({ text: "Save", hidden: true });
    expect(applied.find((candidate) => candidate.id === "icon")?.instanceOf).toBe("icon-b");
    expect(applied.find((candidate) => candidate.id === "slot")?.name).toBe("Content");
    expect(applyComponentProperties(applied, "missing", {})).toBe(applied);
  });

  it("publishes component trees and safely diffs and updates imported libraries", () => {
    const root = shape("component", { componentDefinition: true });
    const child = shape("child", { parentId: root.id, text: "Old" });
    const resource = shape("resource", { type: "resource", resourceKind: "fill-style", hidden: true });
    const assets = publishableLibraryAssets([root, child, resource, shape("ordinary")]);
    expect(assets.map((asset) => asset.id)).toEqual(["component", "child", "resource"]);
    const incoming = assets.map((asset) => asset.id === "child" ? { ...asset, text: "New" } : asset);
    expect(diffLibraryAssets(assets, [...incoming, shape("added", { librarySourceId: "added" })]).map((item) => item.status)).toEqual(["unchanged", "changed", "unchanged", "added"]);
    const firstImport = applyLibraryUpdate([shape("local", { zIndex: 8 })], incoming, "library", 1);
    const updated = applyLibraryUpdate(firstImport, incoming.map((asset) => asset.id === "child" ? { ...asset, text: "Newest" } : asset), "library", 2);
    expect(updated.find((asset) => asset.librarySourceId === "child")).toMatchObject({ text: "Newest", libraryVersion: 2 });
    expect(updated.some((asset) => asset.id === "local")).toBe(true);
  });

  it("validates, splits, and branches shared-point vector networks", () => {
    const vector = shape("vector", { type: "vector", vectorPoints: [
      { id: "a", x: 0, y: 0 }, { id: "b", x: 20, y: 20 }, { id: "c", x: 40, y: 0 },
    ], vectorPaths: [
      { id: "one", pointIds: ["a", "b", "c"], closed: false },
      { id: "bad", pointIds: ["a", "missing"], closed: false },
      { id: "duplicate", pointIds: ["b", "a"], closed: false },
      { id: "short", pointIds: ["c"], closed: false },
    ] });
    expect(validateVectorNetwork(vector).map((issue) => issue.type)).toEqual(expect.arrayContaining(["missing-point", "duplicate-edge", "short-path"]));
    expect(splitVectorPath(vector, "one", "b").vectorPaths).toHaveLength(5);
    expect(splitVectorPath(vector, "one", "a")).toBe(vector);
    const branched = branchVectorPath(vector, "b", { x: 20, y: 60 });
    expect(branched.vectorPoints).toHaveLength(4);
    expect(branched.vectorPaths?.at(-1)?.pointIds[0]).toBe("b");
    expect(branchVectorPath(vector, "unknown", { x: 0, y: 0 })).toBe(vector);
  });

  it("evaluates conditional prototype actions", () => {
    expect(prototypeConditionMatches(undefined, {})).toBe(true);
    expect(prototypeConditionMatches({ variableId: "ready", operator: "truthy" }, { ready: true })).toBe(true);
    expect(prototypeConditionMatches({ variableId: "state", operator: "equals", value: "open" }, { state: "open" })).toBe(true);
    expect(prototypeConditionMatches({ variableId: "state", operator: "not-equals", value: "closed" }, { state: "open" })).toBe(true);
    expect(prototypeConditionMatches({ variableId: "count", operator: "greater", value: 2 }, { count: 3 })).toBe(true);
    expect(prototypeConditionMatches({ variableId: "count", operator: "less", value: 2 }, { count: 3 })).toBe(false);
  });

  it("audits contrast, names, alt text, focus order, and target size", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("invalid", "#ffffff")).toBeNull();
    const findings = auditAccessibility([
      shape("image", { type: "image", semanticRole: "image" }),
      shape("button", { name: "", semanticRole: "button", width: 20, height: 20, focusOrder: 0 }),
      shape("text", { type: "text", text: "Low contrast", color: "#777777", backgroundColor: "#888888", fontSize: 16 }),
    ]);
    expect(findings.map((finding) => finding.rule)).toEqual(expect.arrayContaining(["image-alt", "link-name", "focus-order", "touch-target", "contrast"]));
  });

  it("searches every document surface and replaces only text content", () => {
    const shapes = [
      shape("layer", { name: "Launch card", devAnnotation: "Connect API" }),
      shape("copy", { type: "text", text: "Launch now", pageId: "page" }),
      shape("token", { type: "resource", resourceName: "Launch orange" }),
      shape("board", { type: "board", title: "Launch plan" }),
    ];
    expect(searchDocument(shapes, "launch").map((result) => result.kind)).toEqual(expect.arrayContaining(["layer", "text", "resource", "link"]));
    expect(searchDocument(shapes, "api")[0]).toMatchObject({ kind: "annotation", shapeId: "layer" });
    expect(searchDocument(shapes, "  ")).toEqual([]);
  });

  it("enforces declarative extension permissions and command validation", () => {
    const manifest: ExtensionManifest = { id: "example.tools", name: "Tools", permissions: ["read-document", "write-document"], commands: [
      { id: "rename", name: "Rename", operation: "rename-selected" },
      { id: "fill", name: "Fill", operation: "set-fill" },
      { id: "create", name: "Create", operation: "create-rectangle" },
    ] };
    expect(validateExtensionManifest(manifest)).toBe(manifest);
    expect(runExtensionCommand([shape("one")], ["one"], manifest, "rename", "Renamed")[0]?.name).toBe("Renamed");
    expect(runExtensionCommand([shape("one")], ["one"], manifest, "fill", "#123456")[0]?.backgroundColor).toBe("#123456");
    expect(runExtensionCommand([], [], manifest, "create", "Created")[0]).toMatchObject({ type: "rectangle", name: "Created" });
    expect(() => runExtensionCommand([], [], { ...manifest, permissions: ["read-document"] }, "create", "Nope")).toThrow("cannot edit");
    expect(() => runExtensionCommand([], [], manifest, "missing", "")).toThrow("not found");
    expect(() => validateExtensionManifest({ ...manifest, id: "bad id" })).toThrow("IDs");
    expect(() => validateExtensionManifest({ ...manifest, commands: [manifest.commands[0]!, manifest.commands[0]!] })).toThrow("unique");
  });

  it("serializes media crops, filters, variable axes, and OpenType features", () => {
    const image = shape("image", { type: "image", imageFit: "crop", imageCrop: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, imageFilters: { brightness: 1.2, contrast: 0.9, saturation: 0.8, blur: 2 } });
    expect(mediaCropCss(image)).toEqual({ backgroundSize: "200% 400%", backgroundPosition: "25% 50%" });
    expect(mediaCropCss(shape("plain"))).toBeNull();
    expect(mediaFilterCss(image)).toBe("brightness(1.2) contrast(0.9) saturate(0.8) blur(2px)");
    expect(mediaFilterCss(shape("plain"))).toBe("none");
    expect(fontVariationCss({ wght: 650, wdth: 90 })).toBe('"wdth" 90, "wght" 650');
    expect(fontFeatureCss({ liga: true, kern: false })).toBe('"kern" 0, "liga" 1');
    expect(fontVariationCss()).toBeUndefined();
  });
});
