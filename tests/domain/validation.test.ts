import { describe, expect, it } from "vitest";
import {
  INSPECTION_FIELD_LIMITS,
  isInspection,
  validateInspectionInput,
  validateInspectionPatch,
  type InspectionFormValues,
} from "@/lib/domain/validation";
import { makeInspection } from "../helpers/fixtures";

const TODAY = "2026-11-02";

function formValues(overrides: Partial<InspectionFormValues> = {}): InspectionFormValues {
  return {
    siteId: "TWR-0042",
    siteName: "Hilltop Relay",
    structureType: "monopole",
    inspectorName: "A. Inspector",
    inspectionDate: "2026-11-01",
    location: "",
    weather: "",
    notes: "",
    ...overrides,
  };
}

describe("validateInspectionInput", () => {
  it("accepts valid input and trims text", () => {
    const result = validateInspectionInput(
      formValues({ siteId: "  TWR-0042 ", location: " Ridge Road ", notes: "  " }),
      { today: TODAY },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.siteId).toBe("TWR-0042");
    expect(result.value.location).toBe("Ridge Road");
    expect(result.value.notes).toBeUndefined();
  });

  it("reports every missing required field", () => {
    const result = validateInspectionInput(
      formValues({ siteId: " ", siteName: "", structureType: "", inspectorName: "", inspectionDate: "" }),
      { today: TODAY },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(
      ["inspectionDate", "inspectorName", "siteId", "siteName", "structureType"].sort(),
    );
    expect(result.errors.siteId).toBe("Site ID is required.");
  });

  it("rejects unknown structure types", () => {
    const result = validateInspectionInput(formValues({ structureType: "skyscraper" }), { today: TODAY });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.structureType).toBe("Select a structure type.");
  });

  it("rejects invalid, future and implausibly old dates", () => {
    const cases: [string, string][] = [
      ["2026-02-30", "Enter a valid date."],
      ["2026-11-03", "Inspection date cannot be in the future."],
      ["1989-12-31", "Inspection date must be in 1990 or later."],
    ];
    for (const [date, message] of cases) {
      const result = validateInspectionInput(formValues({ inspectionDate: date }), { today: TODAY });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.inspectionDate).toBe(message);
    }
  });

  it("accepts today's date", () => {
    expect(validateInspectionInput(formValues({ inspectionDate: TODAY }), { today: TODAY }).ok).toBe(true);
  });

  it("enforces length limits on required and optional fields", () => {
    const result = validateInspectionInput(
      formValues({
        siteId: "x".repeat(INSPECTION_FIELD_LIMITS.siteId + 1),
        notes: "x".repeat(INSPECTION_FIELD_LIMITS.notes + 1),
      }),
      { today: TODAY },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.siteId).toMatch(/64 characters or fewer/);
    expect(result.errors.notes).toMatch(/4000 characters or fewer/);
  });
});

describe("validateInspectionPatch", () => {
  it("validates only the fields provided", () => {
    const result = validateInspectionPatch({ siteName: " New name " }, { today: TODAY });
    expect(result).toEqual({ ok: true, value: { siteName: "New name" } });
  });

  it("does not allow required fields to be blanked", () => {
    const result = validateInspectionPatch({ inspectorName: "  " }, { today: TODAY });
    expect(result.ok).toBe(false);
  });

  it("turns a blank optional field into an explicit clear", () => {
    const result = validateInspectionPatch({ weather: "" }, { today: TODAY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.value, "weather")).toBe(true);
    expect(result.value.weather).toBeUndefined();
  });

  it("validates status values", () => {
    expect(validateInspectionPatch({ status: "in_review" }, { today: TODAY }).ok).toBe(true);
    const result = validateInspectionPatch({ status: "certified" }, { today: TODAY });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.status).toBe("Select a valid status.");
  });
});

describe("isInspection", () => {
  it("accepts a complete record", () => {
    expect(isInspection(makeInspection())).toBe(true);
    expect(isInspection(makeInspection({ location: "Ridge Road", notes: "Gate locked" }))).toBe(true);
  });

  it("rejects non-objects and records with missing or invalid fields", () => {
    expect(isInspection(null)).toBe(false);
    expect(isInspection("inspection")).toBe(false);
    const withoutName: Partial<ReturnType<typeof makeInspection>> = makeInspection();
    delete withoutName.siteName;
    expect(isInspection(withoutName)).toBe(false);
    expect(isInspection({ ...makeInspection(), status: "approved" })).toBe(false);
    expect(isInspection({ ...makeInspection(), structureType: "bridge" })).toBe(false);
    expect(isInspection({ ...makeInspection(), inspectionDate: "2026-02-30" })).toBe(false);
    expect(isInspection({ ...makeInspection(), createdAt: "yesterday" })).toBe(false);
    expect(isInspection({ ...makeInspection(), notes: 42 })).toBe(false);
  });
});
