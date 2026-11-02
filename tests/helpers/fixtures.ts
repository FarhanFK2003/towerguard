import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, vi } from "vitest";
import type { Inspection } from "@/lib/domain/types";
import { closeDatabase } from "@/lib/storage/db";

export function makeInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: "insp-1",
    siteId: "TWR-0042",
    siteName: "Hilltop Relay",
    structureType: "lattice",
    inspectorName: "A. Inspector",
    inspectionDate: "2026-10-30",
    status: "draft",
    createdAt: "2026-10-30T08:00:00.000Z",
    updatedAt: "2026-10-30T08:00:00.000Z",
    ...overrides,
  };
}

/** Gives every test its own empty in-memory IndexedDB. */
export function setupFreshIndexedDB(): void {
  beforeEach(async () => {
    await closeDatabase();
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  afterEach(async () => {
    await closeDatabase();
    vi.unstubAllGlobals();
  });
}
