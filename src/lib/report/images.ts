import type { ID } from "@/lib/domain/types";

/** Longest edge of report images. A print-size copy; the stored original is untouched. */
export const REPORT_IMAGE_MAX_EDGE = 1600;
export const REPORT_IMAGE_QUALITY = 0.9;

export type ReportImage =
  | { status: "ready"; url: string; width: number; height: number }
  | { status: "missing" }
  | { status: "failed"; message: string };

export interface ReportImageSource {
  photoId: ID;
  /** True when the snapshot already knows the original is not stored. */
  imageMissing: boolean;
}

export interface ReportImageDeps {
  loadOriginal: (photoId: ID) => Promise<Blob | undefined>;
  /** Decodes and downscales one original into a print-size JPEG. */
  render: (original: Blob) => Promise<{ blob: Blob; width: number; height: number }>;
  createUrl: (blob: Blob) => string;
}

export interface PrepareOptions {
  onImage: (photoId: ID, image: ReportImage, done: number) => void;
  isCancelled: () => boolean;
}

/**
 * Prepares report images strictly one at a time, so at most one original and
 * one decoded bitmap are held in memory. Each original is released before the
 * next is loaded. After cancellation no further URL is created or delivered;
 * the caller revokes the URLs it has already received. Failures are reported
 * per photo, never thrown.
 */
export async function prepareReportImages(
  sources: readonly ReportImageSource[],
  deps: ReportImageDeps,
  { onImage, isCancelled }: PrepareOptions,
): Promise<void> {
  let done = 0;
  for (const source of sources) {
    if (isCancelled()) return;
    let image: ReportImage;
    if (source.imageMissing) {
      image = { status: "missing" };
    } else {
      try {
        const original = await deps.loadOriginal(source.photoId);
        if (!original) {
          image = { status: "missing" };
        } else {
          const rendered = await deps.render(original);
          if (isCancelled()) return;
          image = { status: "ready", url: deps.createUrl(rendered.blob), width: rendered.width, height: rendered.height };
        }
      } catch {
        image = { status: "failed", message: "The image could not be prepared for the report." };
      }
    }
    if (isCancelled()) return;
    done += 1;
    onImage(source.photoId, image, done);
  }
}
