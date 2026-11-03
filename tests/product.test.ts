import { describe, expect, it } from "vitest";
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION } from "@/lib/export/inspection-export";
import { AI_STATUS_STATEMENT, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product";
import { REPORT_DISCLAIMER } from "@/lib/report/model";

describe("product identity", () => {
  it("uses the approved name, tagline and AI status statement", () => {
    expect(PRODUCT_NAME).toBe("TowerGuard");
    expect(PRODUCT_TAGLINE).toBe("Visual Infrastructure Inspection and Evidence Management");
    expect(AI_STATUS_STATEMENT).toBe(
      "TowerGuard currently provides a human-led infrastructure inspection workflow. Photographs, annotations, findings and review decisions are entered and verified by the inspector. Automated AI inference is not currently implemented.",
    );
  });

  it("keeps the export format identifier and version unchanged by the rename", () => {
    expect(EXPORT_FORMAT).toBe("towerguard-inspection-export");
    expect(EXPORT_FORMAT_VERSION).toBe(1);
  });

  it("never brands the report as AI", () => {
    expect(REPORT_DISCLAIMER.join(" ")).not.toMatch(/TowerGuard AI/);
  });
});
