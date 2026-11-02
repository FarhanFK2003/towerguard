"use client";

import { useEffect, useState } from "react";

export type StoredImageState =
  | { status: "loading" }
  | { status: "ready"; url: string; blob: Blob }
  | { status: "missing" }
  | { status: "error"; error: unknown };

/**
 * Loads an image Blob from storage and exposes it as an object URL. The URL is
 * created only after loading and revoked when the component unmounts or `load`
 * changes, so image memory is released. `load` must be stable.
 */
export function useStoredImage(load: () => Promise<Blob | undefined>): StoredImageState {
  const [state, setState] = useState<StoredImageState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    load().then(
      (blob) => {
        if (cancelled) return;
        if (!blob) {
          setState({ status: "missing" });
          return;
        }
        url = URL.createObjectURL(blob);
        setState({ status: "ready", url, blob });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [load]);

  return state;
}
