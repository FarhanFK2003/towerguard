import { describe, expect, it } from "vitest";
import { formatBytes, formatPercent } from "@/lib/format";

describe("formatBytes", () => {
  it("formats values below 1 KB as bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("uses one decimal below 10 units and none above", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(250 * 1024 * 1024)).toBe("250 MB");
  });

  it("caps at terabytes", () => {
    expect(formatBytes(2048 * 1024 ** 4)).toBe("2048 TB");
  });

  it("returns a dash for invalid input", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("rounds to whole percentages", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.256)).toBe("26%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("shows tiny non-zero fractions as <1%", () => {
    expect(formatPercent(0.0004)).toBe("<1%");
  });

  it("clamps out-of-range values and rejects invalid input", () => {
    expect(formatPercent(1.5)).toBe("100%");
    expect(formatPercent(-0.2)).toBe("0%");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});
