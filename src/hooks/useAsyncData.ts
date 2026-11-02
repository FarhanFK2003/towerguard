"use client";

import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: unknown };

/**
 * Runs `load` after mount (browser-only data such as IndexedDB) and exposes
 * loading/ready/error state. `load` must be stable (module-level or wrapped in
 * `useCallback`), otherwise it reloads on every render.
 */
export function useAsyncData<T>(load: () => Promise<T>): {
  state: AsyncState<T>;
  /** Shows the loading state, then loads again. */
  reload: () => void;
  /** Loads again in the background, keeping current data visible until it arrives. */
  refresh: () => void;
} {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, reload, refresh };
}
