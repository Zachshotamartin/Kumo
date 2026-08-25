import type { Shape } from "../classes/shape";
import { measureShapes } from "./measurement";

const shape = (id: string, x: number, y: number, width = 20, height = 20): Shape => ({
  id, type: "rectangle", x1: x, y1: y, x2: x + width, y2: y + height,
  width, height, level: 0, zIndex: 1,
});

describe("canvas measurement", () => {
  it("measures edge gaps on both axes", () => {
    const values = measureShapes(shape("a", 0, 0), shape("b", 50, 70, 30, 10));
    expect(values.map((measurement) => [measurement.axis, measurement.value])).toEqual([
      ["horizontal", 30],
      ["vertical", 50],
    ]);
  });

  it("reports zero for an overlapping axis", () => {
    expect(measureShapes(shape("a", 0, 0), shape("b", 10, 40))[0]?.value).toBe(0);
    expect(measureShapes(shape("a", 0, 0), shape("b", 10, 10)).map((measurement) => measurement.value)).toEqual([0, 0]);
  });

  it("measures shapes positioned above and to the left in reverse argument order", () => {
    const values = measureShapes(shape("lower-right", 80, 90), shape("upper-left", 10, 20));
    expect(values.map((measurement) => measurement.value)).toEqual([50, 50]);
  });
});
