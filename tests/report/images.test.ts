import { describe, expect, it } from "vitest";
import { prepareReportImages, type ReportImage, type ReportImageDeps } from "@/lib/report/images";

function fakeDeps(options: { missing?: string[]; broken?: string[] } = {}) {
  let inFlight = 0;
  let maxInFlight = 0;
  const created: string[] = [];
  const deps: ReportImageDeps = {
    loadOriginal: async (photoId) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      if (options.missing?.includes(photoId)) {
        inFlight -= 1;
        return undefined;
      }
      return new Blob([photoId]);
    },
    render: async (original) => {
      await Promise.resolve();
      const id = await original.text();
      inFlight -= 1;
      if (options.broken?.includes(id)) throw new Error("decode failed");
      return { blob: new Blob([`jpeg-${id}`]), width: 1600, height: 1200 };
    },
    createUrl: (blob) => {
      const url = `blob:${created.length}-${blob.size}`;
      created.push(url);
      return url;
    },
  };
  return { deps, created, maxInFlight: () => maxInFlight };
}

const sources = (...ids: string[]) => ids.map((photoId) => ({ photoId, imageMissing: false }));

describe("prepareReportImages", () => {
  it("prepares images one at a time and reports progress in order", async () => {
    const fake = fakeDeps();
    const progress: [string, number][] = [];
    await prepareReportImages(sources("a", "b", "c"), fake.deps, {
      isCancelled: () => false,
      onImage: (id, _image, done) => progress.push([id, done]),
    });
    expect(fake.maxInFlight()).toBe(1);
    expect(progress).toEqual([["a", 1], ["b", 2], ["c", 3]]);
    expect(fake.created).toHaveLength(3);
  });

  it("reports missing and undecodable images per photo without stopping", async () => {
    const fake = fakeDeps({ missing: ["b"], broken: ["c"] });
    const results = new Map<string, ReportImage>();
    await prepareReportImages(
      [...sources("a", "b", "c"), { photoId: "d", imageMissing: true }],
      fake.deps,
      { isCancelled: () => false, onImage: (id, image) => results.set(id, image) },
    );
    expect(results.get("a")).toMatchObject({ status: "ready", width: 1600, height: 1200 });
    expect(results.get("b")).toEqual({ status: "missing" });
    expect(results.get("c")).toMatchObject({ status: "failed" });
    expect(results.get("d")).toEqual({ status: "missing" });
  });

  it("creates and delivers nothing once cancelled, even mid-render", async () => {
    const fake = fakeDeps();
    let cancelled = false;
    const delivered: string[] = [];
    const render = fake.deps.render;
    fake.deps.render = async (original) => {
      const result = await render(original);
      if ((await original.text()) === "b") cancelled = true;
      return result;
    };
    await prepareReportImages(sources("a", "b", "c"), { ...fake.deps, render: fake.deps.render }, {
      isCancelled: () => cancelled,
      onImage: (id) => delivered.push(id),
    });
    expect(delivered).toEqual(["a"]);
    expect(fake.created).toHaveLength(1);
  });
});
