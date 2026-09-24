import { describe, it, expect } from "vitest";
import { clientIp } from "../../src/server/ip";

describe("Client IP", () => {
  it("SEC-03 prefers proxy-set headers and takes the last x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers({ "x-forwarded-for": "spoofed, 3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
