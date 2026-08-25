import type { Shape } from "../classes/shape";
import { DEFAULT_PAGE_ID, createPage, createSection, createSectionCollection, deletePage, documentPages, duplicatePage, pageIdForShape, renamePage, shapesOnPage } from "./workspace";

const shape = (id: string, x = 0, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: x, y1: 0, x2: x + 20, y2: 20,
  width: 20, height: 20, level: 0, zIndex: x + 1, parentId: null, ...patch,
});

describe("multi-page workspace organization", () => {
  it("migrates an implicit page and filters content by the active page", () => {
    const first = createPage([shape("legacy")], "Research");
    const second = createPage(first.shapes, "Design");
    expect(documentPages(second.shapes).map((page) => page.name)).toEqual(["Page 1", "Research", "Design"]);
    expect(shapesOnPage(second.shapes, documentPages(second.shapes)[0]!.id).map((item) => item.id)).toEqual(["legacy"]);
    expect(shapesOnPage(second.shapes, first.pageId)).toEqual([]);
    expect(shapesOnPage(second.shapes, second.pageId)).toEqual([]);
  });

  it("duplicates hierarchy and deletes a page with its contents", () => {
    const first = createPage([], "Page");
    const frame = shape("frame", 0, { type: "frame", pageId: first.pageId });
    const child = shape("child", 5, { parentId: frame.id, pageId: first.pageId });
    const duplicate = duplicatePage([...first.shapes, frame, child], first.pageId);
    const copied = shapesOnPage(duplicate.shapes, duplicate.pageId);
    expect(copied).toHaveLength(2);
    expect(copied.find((item) => item.type === "rectangle")?.parentId).toBe(copied.find((item) => item.type === "frame")?.id);
    const removed = deletePage(duplicate.shapes, first.pageId);
    expect(shapesOnPage(removed.shapes, removed.nextPageId)).toHaveLength(2);
  });

  it("remaps every internal relationship when duplicating a page", () => {
    const page = createPage([], "System");
    const component = shape("component", 0, {
      type: "frame", name: "Component", pageId: page.pageId, componentDefinition: true,
      componentSetId: "variant", groupId: "group",
    });
    const variant = shape("variant", 30, {
      type: "frame", name: "Variant", pageId: page.pageId, componentDefinition: true,
      componentSetId: component.id, groupId: "group",
    });
    const mask = shape("mask", 5, {
      name: "Mask", type: "ellipse", pageId: page.pageId, parentId: component.id, isMask: true,
    });
    const instance = shape("instance", 60, {
      name: "Instance", type: "frame", pageId: page.pageId, instanceOf: component.id,
      instanceRootId: "instance", componentNodeId: component.id,
    });
    const linked = shape("linked", 65, {
      name: "Linked", pageId: page.pageId, parentId: instance.id, sectionId: mask.id,
      maskId: mask.id, instanceRootId: instance.id, componentNodeId: mask.id,
      prototypeInteractions: [
        { id: "internal", trigger: "click", action: "navigate", destinationId: component.id },
        { id: "external", trigger: "hover", action: "navigate", destinationId: "other-page-frame" },
      ],
      vectorPoints: [{ id: "point", x: 0, y: 0 }],
      gradientStops: [{ id: "stop", position: 0, color: "#fff", opacity: 1 }],
      effects: [{ id: "effect", type: "drop-shadow", color: "#000", x: 1, y: 1, blur: 2, spread: 0, visible: true }],
    });
    const boolean = shape("boolean", 90, {
      name: "Boolean", type: "boolean", pageId: page.pageId,
      booleanChildren: [shape("embedded", 92, { parentId: "boolean", maskId: "embedded" })],
    });
    const duplicated = duplicatePage([...page.shapes, component, variant, mask, instance, linked, boolean], page.pageId);
    const copied = shapesOnPage(duplicated.shapes, duplicated.pageId);
    const copy = (name: string) => copied.find((item) => item.name === name)!;
    const copiedComponent = copy("Component");
    const copiedVariant = copy("Variant");
    const copiedMask = copy("Mask");
    const copiedInstance = copy("Instance");
    const copiedLinked = copy("Linked");
    const copiedBoolean = copy("Boolean");

    expect(copiedComponent.componentSetId).toBe(copiedVariant.id);
    expect(copiedVariant.componentSetId).toBe(copiedComponent.id);
    expect(copiedComponent.groupId).toBe(copiedVariant.groupId);
    expect(copiedComponent.groupId).not.toBe("group");
    expect(copiedInstance).toMatchObject({
      instanceOf: copiedComponent.id,
      instanceRootId: copiedInstance.id,
      componentNodeId: copiedComponent.id,
    });
    expect(copiedLinked).toMatchObject({
      parentId: copiedInstance.id,
      sectionId: copiedMask.id,
      maskId: copiedMask.id,
      instanceRootId: copiedInstance.id,
      componentNodeId: copiedMask.id,
    });
    expect(copiedLinked.prototypeInteractions?.[0]).toMatchObject({ destinationId: copiedComponent.id });
    expect(copiedLinked.prototypeInteractions?.[0]?.id).not.toBe("internal");
    expect(copiedLinked.prototypeInteractions?.[1]?.destinationId).toBe("other-page-frame");
    expect(copiedLinked.vectorPoints?.[0]?.id).not.toBe("point");
    expect(copiedLinked.gradientStops?.[0]?.id).not.toBe("stop");
    expect(copiedLinked.effects?.[0]?.id).not.toBe("effect");
    expect(copiedBoolean.booleanChildren?.[0]?.id).not.toBe("embedded");
    expect(copiedBoolean.booleanChildren?.[0]).toMatchObject({
      parentId: copiedBoolean.id,
      maskId: copiedBoolean.booleanChildren?.[0]?.id,
    });
  });

  it("keeps shared resources global when pages are created, copied, or removed", () => {
    const resource = shape("style", 0, { type: "resource", hidden: true, resourceKind: "fill-style", resourceValue: { backgroundColor: "#fff" } });
    const first = createPage([resource], "One");
    const second = createPage(first.shapes, "Two");
    const duplicate = duplicatePage(second.shapes, first.pageId);
    expect(duplicate.shapes.filter((item) => item.id === resource.id)).toHaveLength(1);
    const removed = deletePage(duplicate.shapes, first.pageId);
    expect(removed.shapes.find((item) => item.id === resource.id)).toBeDefined();
    expect(shapesOnPage(removed.shapes, removed.nextPageId)).not.toContainEqual(expect.objectContaining({ id: resource.id }));
  });

  it("renames pages safely and refuses to remove the last page", () => {
    const created = createPage([], "Ideas");
    const renamed = renamePage(created.shapes, created.pageId, "  ");
    expect(documentPages(renamed).find((page) => page.id === created.pageId)?.name).toBe("Untitled page");
    const onlyPage = renamed.filter((item) => item.id === created.pageId);
    expect(deletePage(onlyPage, created.pageId)).toEqual({ shapes: onlyPage, nextPageId: created.pageId });
  });

  it("wraps selected roots in a section and groups sections into a collection", () => {
    const section = createSection([shape("a"), shape("b", 40)], ["a", "b"], "page", "Exploration");
    expect(section.shapes.filter((item) => item.sectionId === section.sectionId)).toHaveLength(2);
    expect(section.shapes.find((item) => item.id === "a")?.parentId).toBe(section.sectionId);
    const collection = createSectionCollection(section.shapes, [section.sectionId!], "Sprint one");
    expect(collection.shapes.find((item) => item.id === section.sectionId)?.collectionId).toBe(collection.collectionId);
    expect(createSection(section.shapes, [], "page").sectionId).toBeNull();
    expect(createSectionCollection(section.shapes, ["missing"]).collectionId).toBeNull();
  });

  it("normalizes page metadata, fallback ids, and active-page selection", () => {
    const unnamed = shape("page-b", 0, { type: "page-resource", pageName: undefined, name: undefined, pageOrder: undefined });
    const named = shape("page-a", 0, { type: "page-resource", pageName: "Alpha", pageOrder: 0 });
    const later = shape("page-c", 0, { type: "page-resource", pageName: "Later", pageOrder: 2 });
    const pages = documentPages([unnamed, later, named]);
    expect(pages.map((page) => page.name)).toEqual(["Alpha", "Page", "Later"]);
    expect(pageIdForShape(shape("explicit", 0, { pageId: "custom" }), pages)).toBe("custom");
    expect(pageIdForShape(shape("implicit"), [{ id: DEFAULT_PAGE_ID, name: "Page", order: 0 }])).toBe(DEFAULT_PAGE_ID);
    expect(pageIdForShape(shape("first"), pages)).toBe("page-a");
    expect(pageIdForShape(shape("none"), [])).toBe(DEFAULT_PAGE_ID);
    const content = shape("content", 0, { pageId: "page-a" });
    expect(shapesOnPage([named, content], "missing")).toEqual([content]);
    expect(shapesOnPage([named, content], null)).toEqual([content]);
  });

  it("uses default page names and leaves unrelated records unchanged on rename", () => {
    const first = createPage([]);
    expect(documentPages(first.shapes).map((page) => page.name)).toContain("Page 2");
    const renamed = renamePage(first.shapes, first.pageId, "  Roadmap  ");
    expect(documentPages(renamed).find((page) => page.id === first.pageId)?.name).toBe("Roadmap");
    expect(renamePage(renamed, "missing", "Other")).toEqual(renamed);
    expect(duplicatePage(renamed, "missing")).toEqual({ shapes: renamed, pageId: null });
  });

  it("selects adjacent pages when deleting first, last, or unknown pages", () => {
    const first = createPage([], "One");
    const second = createPage(first.shapes, "Two");
    const third = createPage(second.shapes, "Three");
    const pages = documentPages(third.shapes);
    expect(deletePage(third.shapes, pages[0]!.id).nextPageId).toBe(pages[1]!.id);
    expect(deletePage(third.shapes, pages.at(-1)!.id).nextPageId).toBe(pages.at(-2)!.id);
    expect(deletePage(third.shapes, "missing").nextPageId).toBe(pages[0]!.id);
  });

  it("moves descendants into sections and applies the default collection name", () => {
    const parent = shape("parent", 0);
    const child = shape("child", 4, { parentId: parent.id });
    const unrelated = shape("unrelated", 100);
    const section = createSection([parent, child, unrelated], [parent.id, "missing"], "page");
    expect(section.shapes.find((item) => item.id === child.id)?.sectionId).toBe(section.sectionId);
    expect(section.shapes.find((item) => item.id === child.id)?.parentId).toBe(parent.id);
    expect(section.shapes.find((item) => item.id === unrelated.id)).toBe(unrelated);
    const collection = createSectionCollection(section.shapes, [section.sectionId!]);
    expect(collection.shapes.find((item) => item.id === collection.collectionId)?.name).toBe("Collection");
  });
});
