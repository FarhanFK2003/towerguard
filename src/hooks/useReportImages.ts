"use client";

import { useEffect, useState } from "react";
import type { ID } from "@/lib/domain/types";
import { decodeAndThumbnail } from "@/lib/photos/thumbnail";
import {
  REPORT_IMAGE_MAX_EDGE,
  REPORT_IMAGE_QUALITY,
  prepareReportImages,
  type ReportImage,
  type ReportImageDeps,
  type ReportImageSource,
} from "@/lib/report/images";
import { getPhotoOriginal } from "@/lib/storage/photos";

const browserDeps: ReportImageDeps = {
  loadOriginal: getPhotoOriginal,
  render: async (original) => {
    const decoded = await decodeAndThumbnail(original, REPORT_IMAGE_MAX_EDGE, REPORT_IMAGE_QUALITY);
    return { blob: decoded.thumbnail, width: decoded.width, height: decoded.height };
  },
  createUrl: (blob) => URL.createObjectURL(blob),
};

interface PreparedImages {
  /** Inputs the images were prepared for; results for older inputs are ignored. */
  key: string;
  sources: readonly ReportImageSource[];
  images: ReadonlyMap<ID, ReportImage>;
  done: number;
  total: number;
}

/**
 * Prepares print-size report images one at a time with progress. All object
 * URLs are revoked when the inputs change or the component unmounts.
 * `sources` must be memoised; `key` (the report fingerprint) labels the
 * results so images prepared for older data are never shown.
 */
export function useReportImages(key: string, sources: readonly ReportImageSource[]): {
  images: ReadonlyMap<ID, ReportImage>;
  done: number;
  total: number;
  ready: boolean;
} {
  const [state, setState] = useState<PreparedImages>({ key: "", sources: [], images: new Map(), done: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const images = new Map<ID, ReportImage>();
    void prepareReportImages(sources, browserDeps, {
      isCancelled: () => cancelled,
      onImage: (photoId, image, done) => {
        if (image.status === "ready") urls.push(image.url);
        images.set(photoId, image);
        setState({ key, sources, images: new Map(images), done, total: sources.length });
      },
    });
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [key, sources]);

  if (state.key !== key || state.sources !== sources) {
    return { images: new Map(), done: 0, total: sources.length, ready: sources.length === 0 };
  }
  return { images: state.images, done: state.done, total: state.total, ready: state.done === state.total };
}
