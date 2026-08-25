import type { Shape } from "../classes/shape";
import {
  analyzeBoardGraph,
  analyzeDocumentPerformance,
  accessibilityFixPatch,
  applyAccessibilityFixes,
  applyComponentProperties,
  applyLibraryUpdate,
  applyTextRun,
  auditAccessibility,
  branchVectorPath,
  contrastRatio,
  createModeVariable,
  createVariableCollection,
  cullDocumentShapes,
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
  shapeIntersectsViewport,
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

  it("covers rich-text clipping, coalescing, and empty-text fallbacks", () => {
    const runs = normalizeTextRuns("abcdef", [
      { id: "later", start: 0, end: 6, color: "#111111" },
      { id: "first", start: 0, end: 2, color: "#111111" },
      { id: "covered", start: 1, end: 2, color: "#222222" },
      { id: "adjacent", start: 2, end: 4, color: "#111111" },
    ]);
    expect(runs).toEqual([expect.objectContaining({ start: 0, end: 6, color: "#111111" })]);

    const blank = shape("blank", { type: "text", name: "", text: undefined, textRuns: undefined });
    expect(applyTextRun(blank, 2, -2, { fontWeight: "bold" })).toBe(blank);
    expect(textSegments(blank)).toEqual([]);

    const split = shape("split", { type: "text", text: "abcdef", textRuns: [
      { id: "all", start: 0, end: 6, color: "#111111" },
    ] });
    const styled = applyTextRun(split, 2, 4, { color: "#222222" });
    expect(styled.textRuns).toEqual([
      expect.objectContaining({ start: 0, end: 2 }),
      expect.objectContaining({ start: 2, end: 4, color: "#222222" }),
      expect.objectContaining({ start: 4, end: 6 }),
    ]);
    expect(textSegments(shape("plain-text", { type: "text", text: "plain", textRuns: undefined }))).toEqual([
      { text: "plain", style: {} },
    ]);
    expect(applyTextRun(shape("fresh", { type: "text", text: "fresh", textRuns: undefined }), 1, 3, { fontFamily: "Serif" }).textRuns)
      .toEqual([expect.objectContaining({ start: 1, end: 3, fontFamily: "Serif" })]);
    expect(applyTextRun(shape("right", { type: "text", text: "abcdef", textRuns: [{ id: "right", start: 3, end: 6, color: "#111111" }] }), 2, 4, { color: "#222222" }).textRuns)
      .toEqual([expect.objectContaining({ start: 2, end: 4 }), expect.objectContaining({ start: 4, end: 6 })]);
    expect(replaceTextAndRemapRuns(shape("no-runs", { textRuns: undefined }), "new").textRuns).toEqual([]);
  });

  it("covers variable defaults, missing aliases, and unbound resources", () => {
    const collection = createVariableCollection([], "  ", ["  "]);
    expect(Object.values(collection.resource.resourceValue ?? {})).toEqual(["Mode"]);
    expect(collection.resource.resourceName).toBe("Untitled resource");

    const emptyVariable = createModeVariable([], "string-variable", "", "collection", {});
    const variable = emptyVariable.shapes[0]!;
    expect(variable.resourceValue?.value).toBe("");

    const missingAlias = shape("missing-alias", {
      type: "resource", variableAliasId: "absent", resourceValue: { value: "fallback" },
    });
    const noValue = shape("no-value", { type: "resource", variableCollectionId: "collection" });
    const target = shape("target", { variableBindings: { name: "missing-alias", width: "absent", height: "no-value" } });
    const resolved = resolveVariableModes([missingAlias, noValue, target], {});
    expect(resolved.find((item) => item.id === "target")).toMatchObject({ name: "fallback", width: 100, height: 60 });
    expect(resolveVariableModes([shape("untouched")], {})).toEqual([shape("untouched")]);
  });

  it("covers component property guard and targeting branches", () => {
    const noDefinition = shape("root", { instanceOf: "missing" });
    const input = [noDefinition];
    expect(applyComponentProperties(input, "root", {})).toBe(input);

    const definition = defineComponentProperty(shape("definition", { componentDefinition: true }), "label", {
      type: "slot", label: "Label", defaultValue: "Default", targetNodeId: "node",
    });
    const root = shape("root", { instanceOf: "definition", instanceProperties: { existing: "kept" } });
    const unrelated = shape("other", { instanceRootId: "different", componentNodeId: "node" });
    const missingNode = shape("missing-node", { instanceRootId: "root" });
    const wrongNode = shape("wrong", { instanceRootId: "root", componentNodeId: "wrong" });
    const unchanged = applyComponentProperties([definition, root, unrelated, missingNode, wrongNode], "root", { other: "value" });
    expect(unchanged.find((item) => item.id === "root")?.instanceProperties).toEqual({ existing: "kept", other: "value" });
    expect(unchanged.find((item) => item.id === "wrong")?.name).toBe("wrong");

    const defaultSlot = defineComponentProperty(definition, "content", {
      type: "slot", label: "Content", defaultValue: "", targetNodeId: "node",
    });
    const node = shape("node", { instanceRootId: "root", componentNodeId: "node", type: "text" });
    expect(applyComponentProperties([defaultSlot, root, node], "root", { content: "Body" }).find((item) => item.id === "node")?.text).toBe("Body");
  });

  it("covers library removal, source-id, parent, and stacking fallbacks", () => {
    const imported = shape("local-import", { libraryId: "library", librarySourceId: "source", zIndex: 7 });
    const removed = shape("removed", { libraryId: "library", librarySourceId: "removed" });
    const incoming = [
      shape("source", { parentId: "external-parent" }),
      shape("child", { librarySourceId: "child", parentId: "source" }),
    ];
    expect(diffLibraryAssets([imported, removed], incoming).map((item) => item.status)).toEqual(["changed", "removed", "added"]);
    const updated = applyLibraryUpdate([shape("local", { zIndex: 9 }), imported, removed], incoming, "library", 2);
    expect(updated.some((item) => item.librarySourceId === "removed")).toBe(false);
    expect(updated.find((item) => item.librarySourceId === "source")).toMatchObject({ id: "local-import", parentId: "external-parent", zIndex: 7 });
    expect(updated.find((item) => item.librarySourceId === "child")?.parentId).toBe("local-import");

    const sourceFallback = shape("same", { libraryId: "library", librarySourceId: undefined });
    expect(diffLibraryAssets([shape("plain")], [shape("plain")])[0]?.status).toBe("unchanged");
    expect(applyLibraryUpdate([sourceFallback], [shape("same")], "library", 3)[0]).toMatchObject({ id: "same", librarySourceId: "same" });
  });

  it("covers empty and boundary vector-network operations", () => {
    const empty = shape("empty", { type: "vector", vectorPoints: undefined, vectorPaths: undefined });
    expect(validateVectorNetwork(empty)).toEqual([]);
    expect(splitVectorPath(empty, "missing", "point")).toBe(empty);

    const vector = shape("vector", { type: "vector", vectorPoints: [
      { id: "a", x: 0, y: 0 }, { id: "b", x: 1, y: 1 }, { id: "c", x: 2, y: 2 },
    ], vectorPaths: [{ id: "path", pointIds: ["a", "b", "c"], closed: true }] });
    expect(splitVectorPath(vector, "path", "c")).toBe(vector);
    const noPaths = shape("point", { type: "vector", vectorPoints: [{ id: "a", x: 0, y: 0 }], vectorPaths: undefined });
    expect(branchVectorPath(noPaths, "a", { x: 2, y: 2 }).vectorPaths).toHaveLength(1);
  });

  it("evaluates false and type-mismatched prototype conditions", () => {
    expect(prototypeConditionMatches({ variableId: "ready", operator: "truthy" }, { ready: false })).toBe(false);
    expect(prototypeConditionMatches({ variableId: "state", operator: "equals", value: "open" }, { state: "closed" })).toBe(false);
    expect(prototypeConditionMatches({ variableId: "state", operator: "not-equals", value: "open" }, { state: "open" })).toBe(false);
    expect(prototypeConditionMatches({ variableId: "count", operator: "greater", value: 2 }, { count: "3" })).toBe(false);
    expect(prototypeConditionMatches({ variableId: "count", operator: "greater", value: "2" }, { count: 3 })).toBe(false);
    expect(prototypeConditionMatches({ variableId: "count", operator: "less", value: 4 }, { count: 3 })).toBe(true);
    expect(prototypeConditionMatches({ variableId: "count", operator: "less", value: 4 }, { count: "3" })).toBe(false);
    expect(prototypeConditionMatches({ variableId: "count", operator: "less", value: "4" }, { count: 3 })).toBe(false);
  });

  it("builds and applies every accessibility repair", () => {
    const image = shape("image", { type: "image", name: "  " });
    const text = shape("text", { type: "text", name: "", x1: 10, y1: 20, width: 20, height: 30, backgroundColor: undefined });
    const control = shape("control", { name: "", x1: 10, y1: 20, width: 60, height: 20, backgroundColor: "#000000" });
    expect(accessibilityFixPatch(image, "image-alt")).toEqual({ altText: "Describe this image" });
    expect(accessibilityFixPatch(text, "link-name")).toEqual({ text: "Accessible label" });
    expect(accessibilityFixPatch(control, "link-name")).toEqual({ name: "Accessible control" });
    expect(accessibilityFixPatch(text, "focus-order")).toEqual({ focusOrder: 1 });
    expect(accessibilityFixPatch(text, "touch-target")).toMatchObject({ width: 44, height: 44, x2: 54, y2: 64 });
    expect(accessibilityFixPatch(control, "touch-target")).toMatchObject({ width: 60, height: 44 });
    expect(accessibilityFixPatch(text, "contrast")).toEqual({ color: "#111111" });
    expect(accessibilityFixPatch(control, "contrast")).toEqual({ color: "#ffffff" });
    expect(accessibilityFixPatch(shape("invalid-bg", { backgroundColor: "invalid" }), "contrast")).toEqual({ color: "#111111" });
    expect(accessibilityFixPatch(text, "unknown" as never)).toEqual({});

    const fixed = applyAccessibilityFixes([image, text], [
      { shapeId: "image", severity: "error", rule: "image-alt", message: "missing" },
      { shapeId: "image", severity: "warning", rule: "focus-order", message: "order" },
    ]);
    expect(fixed[0]).toMatchObject({ altText: "Describe this image", focusOrder: 1 });
    expect(fixed[1]).toEqual(text);

    expect(auditAccessibility([
      shape("large", { type: "text", text: "Readable", color: "#000000", backgroundColor: "#ffffff", fontSize: 24 }),
      shape("invalid", { type: "text", color: "invalid", backgroundColor: "#ffffff" }),
      shape("link", { semanticRole: "link", text: "Named", width: 44, height: 44, focusOrder: 1 }),
    ])).toEqual([]);
    expect(auditAccessibility([
      shape("small", { type: "text", text: "Copy", color: "#777777", backgroundColor: "#ffffff", fontSize: undefined }),
      shape("large", { type: "text", text: "Copy", color: "#777777", backgroundColor: "#ffffff", fontSize: 24 }),
    ]).map((finding) => finding.shapeId)).toEqual(["small"]);
  });

  it("culls viewport shapes and classifies document complexity", () => {
    const parent = shape("parent", { x1: 10, y1: 10, x2: 20, y2: 20 });
    const child = shape("child", { parentId: "parent", x1: 10, y1: 10, x2: 20, y2: 20 });
    const far = shape("far", { x1: 5000, y1: 5000, x2: 5100, y2: 5100 });
    const guide = shape("guide", { type: "guide", x1: 5000, y1: 5000, x2: 5100, y2: 5100 });
    const page = shape("page", { type: "page-resource", x1: 5000, y1: 5000, x2: 5100, y2: 5100 });
    const resource = shape("resource", { type: "resource", x1: 5000, y1: 5000, x2: 5100, y2: 5100 });
    const viewport = { x: 0, y: 0, width: 100, height: 100 };
    expect(shapeIntersectsViewport(parent, viewport, 0)).toBe(true);
    expect(shapeIntersectsViewport(far, viewport, 0)).toBe(false);
    expect(cullDocumentShapes([parent, child, far, guide, page, resource], viewport, ["far"]).map((item) => item.id))
      .toEqual(["parent", "child", "far", "guide", "page", "resource"]);

    const media = shape("media", { type: "image", effects: [{ id: "blur", type: "layer-blur", color: "#000", x: 0, y: 0, blur: 2, spread: 0, visible: true }], imageFilters: { brightness: 1, contrast: 1, saturation: 1, blur: 2 }, vectorPoints: Array.from({ length: 11 }, (_, index) => ({ id: String(index), x: index, y: index })) });
    expect(analyzeDocumentPerformance([media])).toMatchObject({ level: "healthy", imageCount: 1, effectCount: 2, vectorPointCount: 11 });
    expect(analyzeDocumentPerformance(Array.from({ length: 1501 }, (_, index) => shape(`watch-${index}`))).level).toBe("watch");
    expect(analyzeDocumentPerformance(Array.from({ length: 5001 }, (_, index) => shape(`heavy-${index}`)), viewport).level).toBe("heavy");
  });

  it("covers search labels, manifest names, command fallbacks, and crop bounds", () => {
    const anonymous = shape("anonymous", { name: undefined, resourceName: undefined, type: "text", text: "needle" });
    expect(searchDocument([anonymous], "needle")[0]).toMatchObject({ label: "text", pageId: null });
    expect(searchDocument([shape("board", { type: "board", title: undefined })], "missing")).toEqual([]);
    const untouched = shape("untouched", { text: undefined });
    expect(replaceDocumentText([untouched, shape("copy", { text: "other" })], "needle", "replacement"))
      .toEqual([untouched, shape("copy", { text: "other" })]);

    const manifest: ExtensionManifest = { id: "tools.valid", name: "Tools", permissions: ["write-document"], commands: [
      { id: "rename", name: "Rename", operation: "rename-selected" },
      { id: "fill", name: "Fill", operation: "set-fill" },
      { id: "create", name: "Create", operation: "create-rectangle" },
    ] };
    expect(() => validateExtensionManifest({ ...manifest, name: "  " })).toThrow("name");
    expect(() => validateExtensionManifest({ ...manifest, commands: [] })).toThrow("name");
    const original = shape("one", { name: "Original", backgroundColor: "#abcdef" });
    expect(runExtensionCommand([original], ["one"], manifest, "rename", "   ")[0]?.name).toBe("Original");
    expect(runExtensionCommand([original], [], manifest, "rename", "New")[0]).toBe(original);
    expect(runExtensionCommand([original], ["one"], manifest, "fill", "invalid")[0]?.backgroundColor).toBe("#abcdef");
    expect(runExtensionCommand([original], [], manifest, "fill", "#123456")[0]).toBe(original);
    expect(runExtensionCommand([], [], manifest, "create", "   ")[0]?.name).toBe("Extension rectangle");

    expect(mediaCropCss(shape("bounded", { type: "image", imageFit: "crop", imageCrop: { x: 2, y: 2, width: 0, height: 2 } })))
      .toEqual({ backgroundSize: "2000% 100%", backgroundPosition: "100% 100%" });
    expect(fontVariationCss({})).toBeUndefined();
    expect(fontFeatureCss({})).toBeUndefined();
  });
});
