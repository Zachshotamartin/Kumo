import { applyCollaborativeTextChange, collaborativeTextValue, orderedTextCharacters, pruneCollaborativeText, type CollaborativeTextCharacter } from "./textCrdt";

const ids = (...values: string[]) => { let index = 0; return () => values[index++]!; };

describe("collaborative text CRDT", () => {
  it("inserts in the middle, replaces ranges, and preserves wrapping text exactly", () => {
    const inserted = applyCollaborativeTextChange([], "text", "hello", "heXllo", ids("x"));
    expect(inserted.text).toBe("heXllo");
    expect(collaborativeTextValue(inserted.records, "text")).toBe("heXllo");
    const replaced = applyCollaborativeTextChange(inserted.records, "text", inserted.text, "heya", ids("y", "a"));
    expect(replaced.text).toBe("heya");
    expect(replaced.records.filter((record) => record.deleted).length).toBeGreaterThan(0);
  });

  it("converges simultaneous inserts at the same cursor independent of merge order", () => {
    const base = applyCollaborativeTextChange([], "text", "AB", "AB", ids());
    const left = applyCollaborativeTextChange(base.records, "text", "AB", "AxB", ids("actor-a"));
    const right = applyCollaborativeTextChange(base.records, "text", "AB", "AyB", ids("actor-b"));
    const merge = (first: CollaborativeTextCharacter[], second: CollaborativeTextCharacter[]) => [...new Map([...first, ...second].map((record) => [record.id, record])).values()];
    expect(collaborativeTextValue(merge(left.records, right.records), "text")).toBe("AxyB");
    expect(collaborativeTextValue(merge(right.records, left.records), "text")).toBe("AxyB");
  });

  it("upgrades legacy left-linked records and removes records for deleted shapes", () => {
    const legacy = [
      { id: "a", shapeId: "text", leftId: null, value: "A", deleted: false },
      { id: "b", shapeId: "text", leftId: "a", value: "B", deleted: false },
    ] as CollaborativeTextCharacter[];
    expect(orderedTextCharacters(legacy, "text").map((record) => record.id)).toEqual(["a", "b"]);
    const changed = applyCollaborativeTextChange(legacy, "text", "AB", "ACB", ids("c"));
    expect(changed.text).toBe("ACB");
    expect(changed.records.every((record) => Number.isFinite(record.position))).toBe(true);
    expect(pruneCollaborativeText([...changed.records, { ...changed.records[0]!, id: "gone", shapeId: "gone" }], new Set(["text"]))).toHaveLength(changed.records.length);
  });
});
