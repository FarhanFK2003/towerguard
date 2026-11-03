import { describe, expect, it } from "vitest";
import {
  applyInspectionPatch,
  finaliseInspectionRecord,
  reopenInspectionRecord,
  startInspectionReview,
} from "@/lib/domain/inspection";
import { assessReadiness, canFinalise } from "@/lib/domain/readiness";
import type { Finding } from "@/lib/domain/types";
import { isInspection } from "@/lib/domain/validation";
import { makeFinding, makeInspection } from "../helpers/fixtures";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const reviewed = (overrides: Partial<Finding> = {}) =>
  makeFinding({
    status: "confirmed",
    review: { reviewedBy: "A", reviewedAt: "2026-11-03T10:00:00.000Z" },
    updatedAt: "2026-11-03T10:00:00.000Z",
    evidence: [{ photoId: "p1", annotationIds: [] }],
    ...overrides,
  });

describe("inspection lifecycle transitions", () => {
  it("draft → in_review → finalised → in_review", () => {
    const started = startInspectionReview(makeInspection(), NOW);
    expect(started).toMatchObject({ ok: true, value: { status: "in_review", updatedAt: NOW.toISOString() } });
    if (!started.ok) return;

    const finalised = finaliseInspectionRecord(started.value, "A. Inspector", NOW);
    expect(finalised).toMatchObject({
      ok: true,
      value: { status: "finalised", finalisation: { finalisedBy: "A. Inspector", finalisedAt: NOW.toISOString() } },
    });
    if (!finalised.ok) return;
    expect(isInspection(finalised.value)).toBe(true);

    const reopened = reopenInspectionRecord(finalised.value, NOW);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value.status).toBe("in_review");
    expect(Object.hasOwn(reopened.value, "finalisation")).toBe(false);
    expect(reopened.value.siteName).toBe(makeInspection().siteName);
    expect(isInspection(reopened.value)).toBe(true);
  });

  it("rejects transitions from the wrong state", () => {
    expect(startInspectionReview(makeInspection({ status: "in_review" })).ok).toBe(false);
    expect(finaliseInspectionRecord(makeInspection(), "A").ok).toBe(false); // must be in review first
    expect(reopenInspectionRecord(makeInspection({ status: "in_review" })).ok).toBe(false);
    expect(finaliseInspectionRecord(makeInspection({ status: "in_review" }), "  ").ok).toBe(false);
  });
});

describe("finalisation metadata validation", () => {
  const finalisation = { finalisedBy: "A", finalisedAt: NOW.toISOString() };

  it("existing records without the field stay valid for draft and in_review", () => {
    expect(isInspection(makeInspection())).toBe(true);
    expect(isInspection(makeInspection({ status: "in_review" }))).toBe(true);
  });

  it("requires metadata exactly when finalised", () => {
    expect(isInspection(makeInspection({ status: "finalised", finalisation }))).toBe(true);
    expect(isInspection(makeInspection({ status: "finalised" }))).toBe(false);
    expect(isInspection(makeInspection({ status: "draft", finalisation }))).toBe(false);
    expect(isInspection(makeInspection({ status: "in_review", finalisation }))).toBe(false);
  });

  it("rejects malformed metadata", () => {
    expect(isInspection({ ...makeInspection({ status: "finalised" }), finalisation: { finalisedBy: "", finalisedAt: NOW.toISOString() } })).toBe(false);
    expect(isInspection({ ...makeInspection({ status: "finalised" }), finalisation: { finalisedBy: "A", finalisedAt: "today" } })).toBe(false);
    expect(isInspection({ ...makeInspection({ status: "finalised" }), finalisation: "yes" })).toBe(false);
  });

  it("a plain status patch cannot produce a valid finalised record", () => {
    expect(isInspection(applyInspectionPatch(makeInspection({ status: "in_review" }), { status: "finalised" }, NOW))).toBe(false);
  });
});

describe("assessReadiness", () => {
  it("is ready with only current reviews and evidence", () => {
    const readiness = assessReadiness([reviewed({ id: "a" }), reviewed({ id: "b" })], 0);
    expect(readiness).toMatchObject({ blocked: false, blockers: [], warnings: [], requiresAcknowledgement: false, reviewed: 2, total: 2 });
    expect(canFinalise(readiness, false)).toBe(true);
  });

  it("blocks on unreviewed findings", () => {
    const readiness = assessReadiness([reviewed(), makeFinding({ id: "obs" })], 0);
    expect(readiness.blockers).toEqual([expect.objectContaining({ code: "unreviewed_findings", count: 1, findingIds: ["obs"] })]);
    expect(canFinalise(readiness, true)).toBe(false);
  });

  it("blocks on out-of-date or incomplete reviews", () => {
    const stale = reviewed({ id: "stale", updatedAt: "2026-11-03T11:00:00.000Z" });
    const incomplete = makeFinding({ id: "inc", status: "dismissed" });
    const readiness = assessReadiness([stale, incomplete], 0);
    expect(readiness.blockers).toEqual([expect.objectContaining({ code: "out_of_date_reviews", count: 2, findingIds: ["stale", "inc"] })]);
  });

  it("blocks on damaged finding records instead of ignoring them", () => {
    const readiness = assessReadiness([reviewed()], 2);
    expect(readiness.blockers).toEqual([expect.objectContaining({ code: "damaged_findings", count: 2 })]);
    expect(canFinalise(readiness, true)).toBe(false);
  });

  it("warns about no findings and requires acknowledgement", () => {
    const readiness = assessReadiness([], 0);
    expect(readiness.warnings).toEqual([expect.objectContaining({ code: "no_findings" })]);
    expect(readiness.requiresAcknowledgement).toBe(true);
    expect(canFinalise(readiness, false)).toBe(false);
    expect(canFinalise(readiness, true)).toBe(true);
  });

  it("warns about confirmed findings without evidence (dismissed ones are not counted)", () => {
    const readiness = assessReadiness(
      [
        reviewed({ id: "no-evidence", evidence: [] }),
        makeFinding({ id: "dismissed", status: "dismissed", evidence: [], review: { reviewedBy: "A", reviewedAt: "2026-11-03T10:00:00.000Z", note: "No issue" }, updatedAt: "2026-11-03T10:00:00.000Z" }),
      ],
      0,
    );
    expect(readiness.blocked).toBe(false);
    expect(readiness.warnings).toEqual([expect.objectContaining({ code: "confirmed_without_evidence", findingIds: ["no-evidence"] })]);
  });
});
