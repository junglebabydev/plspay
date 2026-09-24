import { describe, it, expect } from "vitest";
import { formatSGD, parseAmountToCents } from "../../src/lib/money";

describe("Money", () => {
  it("AC-F05-01 formats integer cents as S$ with two decimals", () => {
    expect(formatSGD(2500)).toBe("S$25.00");
    expect(formatSGD(3)).toBe("S$0.03");
    expect(formatSGD(123456)).toBe("S$1,234.56");
    expect(() => formatSGD(10.5)).toThrow();
  });

  it("AC-F03-02 parses typed amounts to cents and rejects fractions of a cent", () => {
    expect(parseAmountToCents("25")).toBe(2500);
    expect(parseAmountToCents("25.5")).toBe(2550);
    expect(parseAmountToCents("S$1,250.05")).toBe(125005);
    expect(parseAmountToCents("0")).toBe(0);
    expect(parseAmountToCents("25.505")).toBeNull();
    expect(parseAmountToCents("-5")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
  });
});
