import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, detectImageType } from "@/lib/photos/validation";

const ROOT = join(__dirname, "..");
const DIR = join(ROOT, "docs", "demo-photos");
const CREDITS = readFileSync(join(DIR, "CREDITS.md"), "utf8");

const ASSETS = [
  {
    file: "demo-01-lattice-tower-nextelsys-wikimedia-cc-by-sa-4.0.jpg",
    photographer: "Nextelsys",
    source: "https://commons.wikimedia.org/wiki/File:Lattice_Tower.jpg",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  {
    file: "demo-02-lattice-tower-top-assad-tanoli-unsplash.jpg",
    photographer: "Assad Tanoli",
    source: "https://unsplash.com/photos/a-tall-cell-tower-against-a-pale-sky-kpgDFUG8jG0",
    licence: "Unsplash Licence",
    licenceUrl: "https://unsplash.com/license",
  },
  {
    file: "demo-03-monopole-head-anderson-wei-pexels.jpg",
    photographer: "Anderson Wei",
    source: "https://www.pexels.com/photo/close-up-of-cellular-tower-against-blue-sky-36247361/",
    licence: "Pexels Licence",
    licenceUrl: "https://www.pexels.com/license/",
  },
] as const;

/** The part of CREDITS.md that describes one file: from its heading to the next heading. */
function creditsSection(file: string): string {
  const start = CREDITS.indexOf(`## ${file}`);
  if (start === -1) return "";
  const next = CREDITS.indexOf("\n## ", start + 1);
  return CREDITS.slice(start, next === -1 ? undefined : next);
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("demonstration photographs", () => {
  it("contains exactly the three expected images", () => {
    const images = readdirSync(DIR).filter((name) => name !== "CREDITS.md").sort();
    expect(images).toEqual(ASSETS.map((a) => a.file).sort());
  });

  describe.each(ASSETS)("$file", (asset) => {
    const bytes = readFileSync(join(DIR, asset.file));
    const section = creditsSection(asset.file);

    it("is a JPEG within the upload size limit", () => {
      expect(detectImageType(bytes.subarray(0, 12))).toBe("image/jpeg");
      expect(bytes.byteLength).toBeLessThan(MAX_PHOTO_BYTES);
    });

    it("is credited with photographer, source and licence", () => {
      expect(section).not.toBe("");
      for (const text of [asset.photographer, asset.source, asset.licence, asset.licenceUrl]) {
        expect(section).toContain(text);
      }
      expect(section).toMatch(/copied byte-for-byte; filename changed only/);
    });

    it("has its recorded SHA-256 matching the file", () => {
      const recorded = section.match(/\b[0-9a-f]{64}\b/g) ?? [];
      expect(recorded).toEqual([createHash("sha256").update(bytes).digest("hex")]);
    });
  });

  it("states that the photographs are third-party assets outside the code licence", () => {
    expect(CREDITS).toContain(
      "These demonstration photographs are third-party assets and are not covered by the TowerGuard application's code licence. Their respective licences continue to apply.",
    );
    expect(CREDITS).toMatch(/not verified photographs from a TowerGuard field inspection/);
  });

  it("is not referenced by application source code", () => {
    const offenders = filesUnder(join(ROOT, "src")).filter((path) => readFileSync(path, "utf8").includes("demo-photos"));
    expect(offenders).toEqual([]);
  });
});
