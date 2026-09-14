import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

type Offset = { x: number; y: number };
type AnimationState = { id: string; baseBody: boolean; baseFace: boolean };
type Expression = { id: string };
interface RuntimeCalibration {
  cache: Map<number[], Map<string, Offset>>;
  shapes: { radii: number[] }[];
  states: AnimationState[];
  expressions: Expression[];
  resolve: (radii: number[] | null, state: string, expression: string | null) => Offset;
  calculate: (state: AnimationState, radii: number[], expression: Expression | null) => Offset;
}

const loadCalibration = (): RuntimeCalibration => {
  const source = readFileSync("public/embed/kumo-logo.js", "utf8").replace(/^export \{.*\};$/m, "");
  return runInNewContext(`${source}\n({ cache: Ot, shapes: Qe, states: ut, expressions: me, resolve: kt, calculate: wt })`, {
    HTMLElement: class {},
    customElements: { get: () => true },
  }) as RuntimeCalibration;
};

it("loads the logo without computing unused geometry calibrations", () => {
  const runtime = loadCalibration();
  expect(runtime.cache.size).toBeGreaterThan(0);
  expect([...runtime.cache.values()].every((entries) => entries.size === 0)).toBe(true);
  expect(runtime.resolve(null, "idle", null)).toEqual({ x: 0, y: 0 });
  expect(runtime.resolve([1, 1, 1], "idle", null)).toEqual({ x: 0, y: 0 });
  expect([...runtime.cache.values()].every((entries) => entries.size === 0)).toBe(true);
});

it("preserves every built-in animation calibration and caches requested results", () => {
  const runtime = loadCalibration();
  for (const { radii } of runtime.shapes) {
    for (const state of runtime.states) {
      if (!state.baseBody) {
        expect(runtime.resolve(radii, state.id, null)).toEqual({ x: 0, y: 0 });
        continue;
      }
      for (const expression of state.baseFace ? [null, ...runtime.expressions] : [null]) {
        const offset = runtime.resolve(radii, state.id, expression?.id ?? null);
        expect(offset).toEqual(runtime.calculate(state, radii, expression));
        expect(runtime.resolve(radii, state.id, expression?.id ?? null)).toBe(offset);
      }
      expect(runtime.resolve(radii, state.id, "unknown-expression")).toBe(runtime.resolve(radii, state.id, null));
    }
    expect(runtime.resolve(radii, "unknown-state", null)).toEqual({ x: 0, y: 0 });
  }
});
