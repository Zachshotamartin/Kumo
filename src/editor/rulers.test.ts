import { RULER_SIZE, rulerTicks } from "./rulers";

describe("ruler ticks", () => {
  it("subtracts the ruler gutter so labels align with canvas world coordinates", () => {
    const ticks = rulerTicks(0, 1, 400, RULER_SIZE, 64);
    expect(ticks.find((tick) => tick.value === 100)).toMatchObject({
      position: 80,
      label: "100",
    });
  });

  it("chooses readable 1/2/5 intervals at low and high zoom", () => {
    const lowZoom = rulerTicks(0, 0.1, 1000);
    const highZoom = rulerTicks(0, 8, 1000);
    expect(lowZoom[1]!.value - lowZoom[0]!.value).toBe(1000);
    expect(highZoom[1]!.value - highZoom[0]!.value).toBe(10);
    expect(lowZoom[1]!.position - lowZoom[0]!.position).toBeGreaterThanOrEqual(64);
    expect(highZoom[1]!.position - highZoom[0]!.position).toBeGreaterThanOrEqual(64);
  });

  it("formats large and fractional values without negative zero", () => {
    expect(rulerTicks(-0.00000000001, 100, 200, 0, 64)[0]!.label).not.toBe("-0");
    expect(rulerTicks(1000, 1, 200, 0, 64)[0]!.label).toBe("1,000");
  });
});
