import { describe, it, expect } from "vitest";
import { equalShares, makeUnique, makeReferences } from "../../src/lib/split";

describe("Splitting", () => {
  it("AC-F03-01 floors equal shares, organiser counted when included", () => {
    expect(equalShares(10000, 3, true)).toEqual([2500, 2500, 2500]);
    expect(equalShares(10000, 3, false)).toEqual([3333, 3333, 3333]);
  });

  it("AC-F03-08 blocks 0 or more than 50 payers", () => {
    expect(() => equalShares(10000, 0, false)).toThrow();
    expect(() => equalShares(10000, 51, false)).toThrow();
  });

  it("AC-F03-03 adds a cent on each collision until unique", () => {
    expect(makeUnique([2500, 2500, 2500]).amounts).toEqual([2500, 2501, 2502]);
    expect(makeUnique([2500, 2501, 2500]).amounts).toEqual([2500, 2501, 2502]);
  });

  it("AC-F03-04 reports total extra cents for the preview", () => {
    expect(makeUnique([2500, 2500, 2500]).extraCents).toBe(3);
    expect(makeUnique([1000, 2000]).extraCents).toBe(0);
  });

  it("AC-F03-05 builds unique references within 25 chars", () => {
    expect(makeReferences("Friday dinner", ["Priya", "Priya", "Ravi Kumar"])).toEqual(["FRID-PRIYA", "FRID-PRIYA2", "FRID-RAVIKUMAR"]);
    expect(makeReferences("", ["Élan!!"])[0]).toBe("PAY-LAN");
    for (const r of makeReferences("A very long title", ["Bartholomew-Alexander"])) expect(r.length).toBeLessThanOrEqual(25);
  });
});
