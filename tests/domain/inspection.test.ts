import { describe, expect, it } from "vitest";
import { applyInspectionPatch, createInspectionRecord } from "@/lib/domain/inspection";
import { isInspection } from "@/lib/domain/validation";
import { makeInspection } from "../helpers/fixtures";

const FIELDS = {
  siteId: "TWR-0042",
  siteName: "Hilltop Relay",
  structureType: "guyed",
  inspectorName: "A. Inspector",
  inspectionDate: "2026-11-01",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createInspectionRecord", () => {
  it("creates a valid draft with a random UUID and matching timestamps", () => {
    const now = new Date("2026-11-02T09:00:00.000Z");
    const record = createInspectionRecord(FIELDS, { now });
    expect(record.id).toMatch(UUID);
    expect(record.status).toBe("draft");
    expect(record.createdAt).toBe("2026-11-02T09:00:00.000Z");
    expect(record.updatedAt).toBe(record.createdAt);
    expect(isInspection(record)).toBe(true);
  });

  it("generates a different ID each time", () => {
    expect(createInspectionRecord(FIELDS).id).not.toBe(createInspectionRecord(FIELDS).id);
  });

  it("omits optional fields that were not provided", () => {
    const record = createInspectionRecord({ ...FIELDS, weather: undefined });
    expect(Object.hasOwn(record, "weather")).toBe(false);
  });
});

describe("applyInspectionPatch", () => {
  const existing = makeInspection({ weather: "Clear", notes: "Gate locked" });
  const now = new Date("2026-11-02T12:00:00.000Z");

  it("applies changes and bumps updatedAt", () => {
    const updated = applyInspectionPatch(existing, { siteName: "Renamed", status: "in_review" }, now);
    expect(updated.siteName).toBe("Renamed");
    expect(updated.status).toBe("in_review");
    expect(updated.updatedAt).toBe(now.toISOString());
    expect(updated.createdAt).toBe(existing.createdAt);
  });

  it("clears optional fields set to undefined", () => {
    const updated = applyInspectionPatch(existing, { weather: undefined }, now);
    expect(Object.hasOwn(updated, "weather")).toBe(false);
    expect(updated.notes).toBe("Gate locked");
  });

  it("never changes id or createdAt, even if a caller passes them", () => {
    const sneaky = { id: "other", createdAt: "2000-01-01T00:00:00.000Z" } as unknown as Parameters<
      typeof applyInspectionPatch
    >[1];
    const updated = applyInspectionPatch(existing, sneaky, now);
    expect(updated.id).toBe(existing.id);
    expect(updated.createdAt).toBe(existing.createdAt);
  });

  it("does not mutate the original record", () => {
    applyInspectionPatch(existing, { siteName: "Renamed" }, now);
    expect(existing.siteName).toBe("Hilltop Relay");
  });
});
