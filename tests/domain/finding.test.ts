import { describe, expect, it } from "vitest";
import {
  applyFindingChanges,
  attachPhoto,
  checkEvidenceRelations,
  createFindingRecord,
  detachAnnotation,
  detachPhoto,
  evidenceCounts,
  filterFindings,
  findEvidenceProblem,
  findingToFormValues,
  isFinding,
  normalizeEvidence,
  summarizeFindings,
  toggleAnnotation,
  validateFindingInput,
  type FindingFields,
  type FindingFormValues,
} from "@/lib/domain/finding";
import { makeAnnotation, makeFinding, makePhotoRecord } from "../helpers/fixtures";

const form = (overrides: Partial<FindingFormValues> = {}): FindingFormValues => ({
  title: "Loose bolt at platform bracket",
  description: "Nut visibly backed off on the north bracket.",
  category: "loose_fastener",
  priority: "high",
  status: "observation",
  componentLocation: "",
  recommendedAction: "",
  ...overrides,
});

const fields: FindingFields = {
  title: "Corrosion",
  description: "Rust on splice.",
  category: "corrosion",
  inspectorPriority: "medium",
  status: "observation",
};

describe("validateFindingInput", () => {
  it("accepts valid input, trims text and clears blank optional fields", () => {
    const result = validateFindingInput(form({ title: "  Loose bolt ", componentLocation: "  " }));
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Loose bolt",
        description: "Nut visibly backed off on the north bracket.",
        category: "loose_fastener",
        inspectorPriority: "high",
        status: "observation",
        componentLocation: undefined,
        recommendedAction: undefined,
      },
    });
  });

  it("requires title, description, category and an explicitly chosen priority", () => {
    const result = validateFindingInput(form({ title: " ", description: "", category: "", priority: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["category", "description", "priority", "title"]);
  });

  it("rejects unknown categories, priorities and statuses", () => {
    const result = validateFindingInput(form({ category: "rust", priority: "critical", status: "certified" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.category).toBe("Select a category.");
      expect(result.errors.priority).toBe("Select a priority.");
      expect(result.errors.status).toBe("Select a status.");
    }
  });

  it("enforces length limits", () => {
    const result = validateFindingInput(form({ title: "x".repeat(121), recommendedAction: "y".repeat(2001) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["recommendedAction", "title"]);
  });

  it("leaves priority blank for new findings instead of guessing from the category", () => {
    expect(findingToFormValues()).toMatchObject({ priority: "", category: "", status: "observation" });
  });
});

describe("evidence helpers", () => {
  it("attaches multiple photographs and multiple annotations per photograph", () => {
    let evidence = attachPhoto([], "p1");
    evidence = toggleAnnotation(evidence, "p1", "a1");
    evidence = toggleAnnotation(evidence, "p1", "a2");
    evidence = toggleAnnotation(evidence, "p2", "a3"); // attaches p2 automatically
    expect(evidence).toEqual([
      { photoId: "p1", annotationIds: ["a1", "a2"] },
      { photoId: "p2", annotationIds: ["a3"] },
    ]);
    expect(evidenceCounts(evidence)).toEqual({ photos: 2, annotations: 3 });
  });

  it("does not attach the same photograph twice and toggles annotations off", () => {
    const evidence = toggleAnnotation(attachPhoto(attachPhoto([], "p1"), "p1"), "p1", "a1");
    expect(toggleAnnotation(evidence, "p1", "a1")).toEqual([{ photoId: "p1", annotationIds: [] }]);
  });

  it("removes a photograph with its annotation links, or a single annotation", () => {
    const evidence = [
      { photoId: "p1", annotationIds: ["a1", "a2"] },
      { photoId: "p2", annotationIds: ["a3"] },
    ];
    expect(detachPhoto(evidence, "p1")).toEqual([{ photoId: "p2", annotationIds: ["a3"] }]);
    expect(detachAnnotation(evidence, "a2")).toEqual([
      { photoId: "p1", annotationIds: ["a1"] },
      { photoId: "p2", annotationIds: ["a3"] },
    ]);
  });

  it("normalises duplicate references", () => {
    expect(
      normalizeEvidence([
        { photoId: "p1", annotationIds: ["a1", "a1"] },
        { photoId: "p1", annotationIds: ["a2"] },
        { photoId: "p2", annotationIds: ["a1"] },
      ]),
    ).toEqual([
      { photoId: "p1", annotationIds: ["a1", "a2"] },
      { photoId: "p2", annotationIds: [] },
    ]);
  });

  it("reports duplicate and malformed stored evidence", () => {
    expect(findEvidenceProblem([])).toBeUndefined();
    expect(findEvidenceProblem([{ photoId: "p1", annotationIds: [] }, { photoId: "p1", annotationIds: [] }])).toMatch(/more than once/);
    expect(findEvidenceProblem([{ photoId: "p1", annotationIds: ["a"] }, { photoId: "p2", annotationIds: ["a"] }])).toMatch(/more than once/);
    expect(findEvidenceProblem([{ photoId: "", annotationIds: [] }])).toMatch(/malformed/);
    expect(findEvidenceProblem([{ photoId: "p1" }])).toMatch(/malformed/);
    expect(findEvidenceProblem("p1")).toMatch(/list/);
  });
});

describe("checkEvidenceRelations", () => {
  const photo = makePhotoRecord({ id: "p1", inspectionId: "insp-1" });
  const otherPhoto = makePhotoRecord({ id: "p9", inspectionId: "insp-2" });
  const ann = makeAnnotation({ id: "a1", photoId: "p1", inspectionId: "insp-1" });
  const annOnOtherPhoto = makeAnnotation({ id: "a2", photoId: "p2", inspectionId: "insp-1" });
  const records = {
    photos: new Map<string, unknown>([["p1", photo], ["p9", otherPhoto], ["p2", makePhotoRecord({ id: "p2" })]]),
    annotations: new Map<string, unknown>([["a1", ann], ["a2", annOnOtherPhoto]]),
  };

  it("accepts photographs and annotations from the same inspection", () => {
    expect(checkEvidenceRelations("insp-1", [{ photoId: "p1", annotationIds: ["a1"] }], records)).toBeUndefined();
  });

  it("rejects missing references", () => {
    expect(checkEvidenceRelations("insp-1", [{ photoId: "gone", annotationIds: [] }], records)).toMatch(/does not exist/);
    expect(checkEvidenceRelations("insp-1", [{ photoId: "p1", annotationIds: ["gone"] }], records)).toMatch(/does not exist/);
  });

  it("rejects cross-inspection photographs", () => {
    expect(checkEvidenceRelations("insp-1", [{ photoId: "p9", annotationIds: [] }], records)).toMatch(/different inspection/);
  });

  it("rejects annotations listed under the wrong photograph", () => {
    expect(checkEvidenceRelations("insp-1", [{ photoId: "p1", annotationIds: ["a2"] }], records)).toMatch(/not on the photograph/);
  });
});

describe("finding records", () => {
  const now = new Date("2026-11-02T10:00:00.000Z");

  it("creates manual findings with engineering severity not assessed", () => {
    const record = createFindingRecord(fields, [{ photoId: "p1", annotationIds: ["a1", "a1"] }], { inspectionId: "insp-1", recordedBy: "A. Inspector" }, { now });
    expect(record).toMatchObject({
      inspectionId: "insp-1",
      engineeringSeverity: "not_assessed",
      provenance: { source: "manual", recordedBy: "A. Inspector", recordedAt: now.toISOString() },
      evidence: [{ photoId: "p1", annotationIds: ["a1"] }],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(record.review).toBeUndefined();
    expect(isFinding(record)).toBe(true);
  });

  it("records the review when created as confirmed", () => {
    const record = createFindingRecord({ ...fields, status: "confirmed" }, [], { inspectionId: "i", recordedBy: "A" }, { now });
    expect(record.review).toEqual({ reviewedBy: "A", reviewedAt: now.toISOString() });
  });

  it("records who reviewed a status change, and clears it on return to observation", () => {
    const later = new Date("2026-11-03T09:00:00.000Z");
    const confirmed = applyFindingChanges(makeFinding(), { fields: { ...fields, status: "confirmed" } }, "B. Reviewer", later);
    expect(confirmed.review).toEqual({ reviewedBy: "B. Reviewer", reviewedAt: later.toISOString() });
    expect(confirmed.provenance.recordedBy).toBe("A. Inspector");
    expect(confirmed.createdAt).toBe(makeFinding().createdAt);
    expect(applyFindingChanges(confirmed, { fields: { ...fields, status: "observation" } }, "B", later).review).toBeUndefined();
  });

  it("keeps engineering severity unchanged when the inspector priority changes", () => {
    const updated = applyFindingChanges(makeFinding(), { fields: { ...fields, inspectorPriority: "urgent" } }, "A");
    expect(updated.inspectorPriority).toBe("urgent");
    expect(updated.engineeringSeverity).toBe("not_assessed");
  });

  it("rejects damaged findings", () => {
    expect(isFinding(makeFinding())).toBe(true);
    expect(isFinding({ ...makeFinding(), title: "" })).toBe(false);
    expect(isFinding({ ...makeFinding(), description: undefined })).toBe(false);
    expect(isFinding({ ...makeFinding(), category: "rust" })).toBe(false);
    expect(isFinding({ ...makeFinding(), inspectorPriority: "critical" })).toBe(false);
    expect(isFinding({ ...makeFinding(), status: "certified" })).toBe(false);
    expect(isFinding({ ...makeFinding(), provenance: { source: "model", recordedBy: "x", recordedAt: "2026-01-01T00:00:00.000Z" } })).toBe(false);
    expect(isFinding({ ...makeFinding(), provenance: undefined })).toBe(false);
    expect(isFinding({ ...makeFinding(), updatedAt: "yesterday" })).toBe(false);
    expect(isFinding({ ...makeFinding(), evidence: [{ photoId: "p", annotationIds: ["a", "a"] }] })).toBe(false);
    expect(isFinding({ ...makeFinding(), review: { reviewedBy: "", reviewedAt: "2026-01-01T00:00:00.000Z" } })).toBe(false);
  });
});

describe("filtering and summaries", () => {
  const findings = [
    makeFinding({ id: "1", category: "corrosion", inspectorPriority: "high", status: "observation" }),
    makeFinding({ id: "2", category: "corrosion", inspectorPriority: "urgent", status: "confirmed" }),
    makeFinding({ id: "3", category: "bird_nest", inspectorPriority: "low", status: "dismissed" }),
    makeFinding({ id: "4", category: "weld_anomaly", inspectorPriority: "high", status: "confirmed" }),
  ];

  it("filters by any combination of category, priority and status", () => {
    expect(filterFindings(findings, {}).map((f) => f.id)).toEqual(["1", "2", "3", "4"]);
    expect(filterFindings(findings, { category: "corrosion" }).map((f) => f.id)).toEqual(["1", "2"]);
    expect(filterFindings(findings, { priority: "high", status: "confirmed" }).map((f) => f.id)).toEqual(["4"]);
    expect(filterFindings(findings, { category: "bird_nest", status: "observation" })).toEqual([]);
  });

  it("counts by status, and by priority excluding dismissed findings", () => {
    expect(summarizeFindings(findings)).toEqual({
      total: 4,
      byStatus: { observation: 1, confirmed: 2, dismissed: 1 },
      byPriority: { low: 0, medium: 0, high: 2, urgent: 1 },
    });
  });
});
