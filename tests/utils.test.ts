import { describe, expect, it } from "vitest";
import { escapeRegex } from "../src/utils/escapeRegex.js";
import { toObjectId } from "../src/utils/objectId.js";

describe("escapeRegex", () => {
  it("neutralises every regex metacharacter", () => {
    const hostile = ".*+?^${}()|[]\\";
    const pattern = new RegExp(`^${escapeRegex(hostile)}$`);
    expect(pattern.test(hostile)).toBe(true);
    expect(pattern.test("anything else")).toBe(false);
  });

  it("leaves ordinary text alone", () => {
    expect(escapeRegex("Harbor Sound 24")).toBe("Harbor Sound 24");
  });

  it("stops a catch-all pattern from matching arbitrary text", () => {
    expect(new RegExp(escapeRegex(".*"), "i").test("podcast")).toBe(false);
  });
});

describe("toObjectId", () => {
  it("accepts 24 character hex strings", () => {
    expect(toObjectId("64b000000000000000000001").toHexString()).toBe("64b000000000000000000001");
  });

  it("rejects everything else with a labelled 400", () => {
    for (const bad of ["", "abc", "64b00000000000000000000z", "64b0000000000000000000011", "{ $ne: null }"]) {
      expect(() => toObjectId(bad, "studio id")).toThrowError(/Invalid studio id/);
    }
  });
});
