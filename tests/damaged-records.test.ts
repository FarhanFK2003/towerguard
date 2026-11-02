import { describe, expect, it } from "vitest";
import { describeDamagedRecords } from "@/components/inspections/damaged-records";

describe("describeDamagedRecords", () => {
  it("uses singular wording for one record", () => {
    const { title, detail } = describeDamagedRecords(1);
    expect(title).toBe("1 inspection record could not be displayed");
    expect(detail).toContain("It has not been changed or deleted.");
  });

  it("includes the exact count for several records", () => {
    const { title, detail } = describeDamagedRecords(3);
    expect(title).toBe("3 inspection records could not be displayed");
    expect(detail).toContain("They have not been changed or deleted.");
  });
});
