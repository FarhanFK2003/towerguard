import { describe, expect, it } from "vitest";
import {
  REVIEW_NOTE_LIMIT,
  applyFindingChanges,
  applyReviewDecision,
  filterFindings,
  isEditedAfterReview,
  isFinding,
  needsReview,
  nextFindingNeedingReview,
  reviewCounts,
  reviewState,
  validateReviewInput,
} from "@/lib/domain/finding";
import type { Finding } from "@/lib/domain/types";
import { makeFinding } from "../helpers/fixtures";

const T0 = new Date("2026-11-03T09:00:00.000Z");
const T1 = new Date("2026-11-03T10:00:00.000Z");
const T2 = new Date("2026-11-03T11:00:00.000Z");

const confirmed = (overrides: Partial<Finding> = {}) =>
  makeFinding({
    status: "confirmed",
    review: { reviewedBy: "A. Inspector", reviewedAt: T1.toISOString() },
    updatedAt: T1.toISOString(),
    ...overrides,
  });

describe("validateReviewInput", () => {
  it("accepts confirm with or without a note, trimming it", () => {
    expect(validateReviewInput({ decision: "confirm", note: "  Verified on site  " })).toEqual({
      ok: true,
      value: { decision: "confirm", note: "Verified on site" },
    });
    expect(validateReviewInput({ decision: "confirm", note: "   " })).toEqual({ ok: true, value: { decision: "confirm" } });
  });

  it("requires a reason to dismiss", () => {
    expect(validateReviewInput({ decision: "dismiss", note: "  " })).toEqual({
      ok: false,
      error: "A reason is required to dismiss a finding.",
    });
    expect(validateReviewInput({ decision: "dismiss", note: "Shadow, not corrosion" })).toEqual({
      ok: true,
      value: { decision: "dismiss", note: "Shadow, not corrosion" },
    });
  });

  it("enforces the note length limit", () => {
    expect(validateReviewInput({ decision: "confirm", note: "x".repeat(REVIEW_NOTE_LIMIT) }).ok).toBe(true);
    expect(validateReviewInput({ decision: "confirm", note: "x".repeat(REVIEW_NOTE_LIMIT + 1) })).toMatchObject({ ok: false });
  });

  it("ignores any note when returning to observation and rejects unknown decisions", () => {
    expect(validateReviewInput({ decision: "return", note: "anything" })).toEqual({ ok: true, value: { decision: "return" } });
    expect(validateReviewInput({ decision: "certify", note: "" })).toMatchObject({ ok: false });
  });
});

describe("applyReviewDecision", () => {
  it("confirms with reviewer, note, and one shared timestamp for review and updatedAt", () => {
    const result = applyReviewDecision(makeFinding(), { decision: "confirm", note: "Verified" }, "A. Inspector", T1);
    expect(result.status).toBe("confirmed");
    expect(result.review).toEqual({ reviewedBy: "A. Inspector", reviewedAt: T1.toISOString(), note: "Verified" });
    expect(result.updatedAt).toBe(result.review?.reviewedAt);
    expect(reviewState(result)).toBe("current");
    expect(isFinding(result)).toBe(true);
  });

  it("dismisses with a reason", () => {
    const result = applyReviewDecision(makeFinding(), { decision: "dismiss", note: "Duplicate" }, "A", T1);
    expect(result).toMatchObject({ status: "dismissed", review: { note: "Duplicate" } });
    expect(reviewState(result)).toBe("current");
  });

  it("returning to observation clears the review", () => {
    const result = applyReviewDecision(confirmed(), { decision: "return" }, "A", T2);
    expect(result.status).toBe("observation");
    expect(result.review).toBeUndefined();
  });

  it("changes nothing but status, review and updatedAt", () => {
    const original = makeFinding({ evidence: [{ photoId: "p1", annotationIds: ["a1"] }], recommendedAction: "Re-torque" });
    const result = applyReviewDecision(original, { decision: "confirm" }, "A", T1);
    // Put back the three fields a review may change; everything else must be identical.
    expect({ ...result, status: original.status, review: original.review, updatedAt: original.updatedAt }).toEqual(original);
  });
});

describe("reviewState and needsReview", () => {
  it("observations need review", () => {
    expect(reviewState(makeFinding())).toBe("unreviewed");
    expect(needsReview(makeFinding())).toBe(true);
  });

  it("a fresh review is current", () => {
    expect(reviewState(confirmed())).toBe("current");
    expect(needsReview(confirmed())).toBe(false);
  });

  it("an edit after the review makes it stale", () => {
    const edited = applyFindingChanges(confirmed(), { evidence: [] }, "A", T2);
    expect(reviewState(edited)).toBe("stale");
    expect(isEditedAfterReview(edited)).toBe(true);
    expect(needsReview(edited)).toBe(true);
  });

  it("an edit in the same millisecond as the review, or with the clock behind it, is still detected", () => {
    const sameInstant = applyFindingChanges(confirmed(), { evidence: [] }, "A", T1);
    expect(reviewState(sameInstant)).toBe("stale");
    const clockBehind = applyFindingChanges(confirmed(), { evidence: [] }, "A", T0);
    expect(reviewState(clockBehind)).toBe("stale");
    expect(Date.parse(clockBehind.updatedAt)).toBeGreaterThan(Date.parse(T1.toISOString()));
  });

  it("a review is always current even if the clock is behind the last edit", () => {
    const edited = makeFinding({ updatedAt: T2.toISOString() });
    const reviewed = applyReviewDecision(edited, { decision: "confirm" }, "A", T0);
    expect(reviewState(reviewed)).toBe("current");
    expect(reviewed.review?.reviewedAt).toBe(reviewed.updatedAt);
  });

  it("re-reviewing a stale finding makes it current again", () => {
    const edited = applyFindingChanges(confirmed(), { evidence: [] }, "A", T2);
    const reviewed = applyReviewDecision(edited, { decision: "confirm" }, "A", new Date("2026-11-03T12:00:00.000Z"));
    expect(reviewState(reviewed)).toBe("current");
  });

  it("confirmed or dismissed without review metadata, or dismissed without a reason, is incomplete", () => {
    expect(reviewState(makeFinding({ status: "confirmed" }))).toBe("incomplete");
    expect(reviewState(makeFinding({ status: "dismissed", review: { reviewedBy: "A", reviewedAt: T1.toISOString() }, updatedAt: T1.toISOString() }))).toBe(
      "incomplete",
    );
    expect(needsReview(makeFinding({ status: "dismissed" }))).toBe(true);
  });

  it("filters, counts and picks the next finding needing review in list order", () => {
    const list = [
      confirmed({ id: "current" }),
      makeFinding({ id: "obs" }),
      confirmed({ id: "stale", updatedAt: T2.toISOString() }),
      makeFinding({ id: "dismissed", status: "dismissed", review: { reviewedBy: "A", reviewedAt: T1.toISOString(), note: "No issue" }, updatedAt: T1.toISOString() }),
    ];
    expect(filterFindings(list, { needsReview: true }).map((f) => f.id)).toEqual(["obs", "stale"]);
    expect(filterFindings(list, { needsReview: true, status: "confirmed" }).map((f) => f.id)).toEqual(["stale"]);
    expect(nextFindingNeedingReview(list)?.id).toBe("obs");
    expect(nextFindingNeedingReview(list, "obs")?.id).toBe("stale");
    expect(nextFindingNeedingReview([confirmed()])).toBeUndefined();
    expect(reviewCounts(list)).toEqual({ total: 4, unreviewed: 1, confirmed: 1, dismissed: 1, outOfDate: 1 });
  });
});

describe("isFinding review note validation", () => {
  it("accepts a valid note and rejects malformed ones", () => {
    const review = { reviewedBy: "A", reviewedAt: T1.toISOString() };
    expect(isFinding(confirmed({ review: { ...review, note: "Fine" } }))).toBe(true);
    expect(isFinding({ ...confirmed(), review: { ...review, note: 42 } })).toBe(false);
    expect(isFinding({ ...confirmed(), review: { ...review, note: "   " } })).toBe(false);
    expect(isFinding({ ...confirmed(), review: { ...review, note: "x".repeat(REVIEW_NOTE_LIMIT + 1) } })).toBe(false);
  });
});
