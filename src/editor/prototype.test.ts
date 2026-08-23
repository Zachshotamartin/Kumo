import type { Shape } from "../classes/shape";
import {
  addPrototypeInteraction,
  interactionForTrigger,
  removePrototypeInteraction,
  setPrototypeStart,
  shapesInPrototypeFrame,
  startPrototypeFrame,
} from "./prototype";

const shape = (id: string, type = "rectangle", patch: Partial<Shape> = {}): Shape => ({
  id, type, x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100,
  level: 0, zIndex: 1, parentId: null, ...patch,
});

describe("prototype flows", () => {
  it("chooses an explicit starting frame and scopes its rendered descendants", () => {
    const first = shape("first", "frame");
    const second = shape("second", "frame", { prototypeStart: true, zIndex: 2 });
    const child = shape("child", "rectangle", { parentId: second.id, zIndex: 3 });
    expect(startPrototypeFrame([first, second, child])?.id).toBe(second.id);
    expect(shapesInPrototypeFrame([first, second, child], second.id).map((item) => item.id)).toEqual([second.id, child.id]);
  });

  it("adds, resolves, and removes trigger-specific interactions", () => {
    const source = shape("source");
    const added = addPrototypeInteraction([source], source.id, { trigger: "click", action: "navigate", destinationId: "target" });
    const interaction = interactionForTrigger(added[0]!, "click")!;
    expect(interaction).toMatchObject({ action: "navigate", destinationId: "target" });
    expect(removePrototypeInteraction(added, source.id, interaction.id)[0]?.prototypeInteractions).toEqual([]);
  });

  it("keeps exactly one start frame", () => {
    const result = setPrototypeStart([shape("one", "frame", { prototypeStart: true }), shape("two", "frame")], "two");
    expect(result.map((item) => item.prototypeStart)).toEqual([false, true]);
  });
});
