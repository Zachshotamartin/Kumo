import { stringQuery } from "../../server/api/_http";

describe("API HTTP helpers", () => {
  it("normalizes scalar, repeated, empty, and absent query values", () => {
    expect(stringQuery("one")).toBe("one");
    expect(stringQuery(["one", "two"])).toBe("one");
    expect(stringQuery([])).toBe("");
    expect(stringQuery(undefined)).toBe("");
  });
});
