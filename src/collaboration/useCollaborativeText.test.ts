import { LiveMap, LiveObject, type LsonObject } from "@liveblocks/client";
import { act, renderHook } from "@testing-library/react";
import { useCollaborativeText } from "./useCollaborativeText";

const harness = vi.hoisted(() => ({
  storage: null as null | {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  },
}));

vi.mock("@liveblocks/react", () => ({
  useMutation: (callback: (context: { storage: unknown }, ...args: string[]) => void) =>
    (...args: string[]) => callback({ storage: harness.storage }, ...args),
}));

const makeStorage = (characters?: LiveMap<string, LiveObject<LsonObject>>, includeNode = true) => {
  let textCharacters = characters;
  const update = vi.fn();
  const nodes = new Map(includeNode ? [["shape", { update }]] : []);
  const storage = {
    get: (key: string) => key === "textCharacters" ? textCharacters : nodes,
    set: (key: string, value: unknown) => {
      if (key === "textCharacters") textCharacters = value as LiveMap<string, LiveObject<LsonObject>>;
    },
  };
  return { storage, update, characters: () => textCharacters! };
};

describe("useCollaborativeText", () => {
  it("creates shared character storage, inserts text, and tombstones removed characters", () => {
    const shared = makeStorage();
    harness.storage = shared.storage;
    const { result } = renderHook(() => useCollaborativeText());

    act(() => { result.current("shape", "", "AB"); });
    expect([...shared.characters().values()]).toHaveLength(2);
    expect(shared.update).toHaveBeenLastCalledWith({ text: "AB" });

    act(() => { result.current("shape", "AB", "A"); });
    expect([...shared.characters().values()].some((character) => character.get("deleted") === true)).toBe(true);
    expect(shared.update).toHaveBeenLastCalledWith({ text: "A" });
  });

  it("upgrades legacy positions, leaves unchanged records alone, and tolerates a missing node", () => {
    const characters = new LiveMap<string, LiveObject<LsonObject>>();
    const first = new LiveObject({ id: "a", shapeId: "shape", leftId: null, position: Number.NaN, value: "A", deleted: false } as unknown as LsonObject);
    const second = new LiveObject({ id: "b", shapeId: "other", leftId: null, position: 1, value: "B", deleted: false } as unknown as LsonObject);
    const firstUpdate = vi.spyOn(first, "update");
    const secondUpdate = vi.spyOn(second, "update");
    characters.set("a", first);
    characters.set("b", second);
    const shared = makeStorage(characters, false);
    harness.storage = shared.storage;
    const { result } = renderHook(() => useCollaborativeText());

    act(() => { result.current("shape", "A", "A"); });
    expect(firstUpdate).toHaveBeenCalledWith({ deleted: false, position: 1 });
    expect(secondUpdate).not.toHaveBeenCalled();
  });
});
