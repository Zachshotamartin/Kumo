import type { Shape } from "../classes/shape";
import { createPage, createSection, createSectionCollection, deletePage, documentPages, duplicatePage, renamePage, shapesOnPage } from "./workspace";

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
});
