import { describe, expect, it } from "vitest";
import { isActivePath } from "@/lib/navigation";

describe("isActivePath", () => {
  it("matches the root route only exactly", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/inspections", "/")).toBe(false);
  });

  it("matches a route and its children", () => {
    expect(isActivePath("/inspections", "/inspections")).toBe(true);
    expect(isActivePath("/inspections/abc/report", "/inspections")).toBe(true);
  });

  it("does not match routes that merely share a prefix", () => {
    expect(isActivePath("/inspections-archive", "/inspections")).toBe(false);
  });

  it("tolerates a trailing slash on the href", () => {
    expect(isActivePath("/inspections/abc", "/inspections/")).toBe(true);
  });
});
