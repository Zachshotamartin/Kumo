import type { Shape } from "../classes/shape";
import { applyShapeMutation } from "./mutations";

const shape = (id: string, x = 0): Shape => ({
  id,
  type: "rectangle",
  x1: x,
  y1: 0,
  x2: x + 20,
  y2: 20,
  width: 20,
  height: 20,
  level: 0,
  zIndex: 1,
});

const fakeNodes = (initial: Record<string, Record<string, unknown>> = {}) => {
  const records = new Map(Object.entries(initial));
  const deleted: string[] = [];
  const created: string[] = [];
  const nodes = {
    get: (id: string) => {
      const record = records.get(id);
      if (!record) return undefined;
      return {
        update: (patch: Record<string, unknown>) => Object.assign(record, patch),
        delete: (key: string) => { delete record[key]; },
      };
    },
    set: (id: string) => {
      created.push(id);
      records.set(id, {});
    },
    delete: (id: string) => {
      deleted.push(id);
      records.delete(id);
    },
  };
  return { nodes, records, deleted, created };
};

describe("collaborative mutations", () => {
  it("does not recreate a shape deleted remotely during a local gesture", () => {
    const baseline = [shape("moving"), shape("deleted", 40)];
    const next = [shape("moving", 10), baseline[1]!];
    const target = fakeNodes({ moving: { x1: 0 } });
    applyShapeMutation(target.nodes, next, baseline);
    expect(target.created).toEqual([]);
    expect(target.records.has("deleted")).toBe(false);
    expect(target.records.get("moving")?.x1).toBe(10);
  });

  it("creates only genuinely local additions", () => {
    const target = fakeNodes();
    applyShapeMutation(target.nodes, [shape("new")], []);
    expect(target.created).toEqual(["new"]);
  });

  it("applies local removals and property removals without replacing nodes", () => {
    const previous = [{ ...shape("kept"), text: "old" }, shape("removed")];
    const next = [{ ...shape("kept", 15), text: undefined }];
    const target = fakeNodes({
      kept: { x1: 0, text: "old" },
      removed: { x1: 40 },
    });
    applyShapeMutation(target.nodes, next, previous);
    expect(target.deleted).toEqual(["removed"]);
    expect(target.records.get("kept")?.x1).toBe(15);
    expect(target.records.get("kept")).not.toHaveProperty("text");
  });
});
