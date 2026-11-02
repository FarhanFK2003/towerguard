import { describe, expect, it } from "vitest";
import { isIsoDate, isIsoDateTime, toLocalIsoDate } from "@/lib/dates";

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-11-02")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects impossible dates and other formats", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("02/11/2026")).toBe(false);
    expect(isIsoDate("2026-11-02T00:00:00Z")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("isIsoDateTime", () => {
  it("accepts ISO timestamps and rejects other strings", () => {
    expect(isIsoDateTime("2026-11-02T10:15:00.000Z")).toBe(true);
    expect(isIsoDateTime("2026-11-02")).toBe(false);
    expect(isIsoDateTime("not a date")).toBe(false);
  });
});

describe("toLocalIsoDate", () => {
  it("formats the local calendar date with zero padding", () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
