"use client";

import { useEffect, useState } from "react";
import { formatBytes, formatPercent } from "@/lib/format";

type StorageState =
  | { status: "loading" }
  | { status: "unsupported" }
  | { status: "error" }
  | { status: "ready"; usage: number; quota: number; persisted: boolean | null };

async function readStorageState(): Promise<StorageState> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { status: "unsupported" };
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    return { status: "ready", usage, quota, persisted };
  } catch {
    return { status: "error" };
  }
}

/**
 * Shows this origin's real browser storage usage and quota. Change
 * `refreshKey` to re-read it (e.g. after photographs are added or removed).
 */
export function StorageStatus({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<StorageState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    readStorageState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (state.status === "loading") {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-2 w-full animate-pulse rounded-full bg-slate-200" />
      </div>
    );
  }

  if (state.status === "unsupported" || state.status === "error") {
    return (
      <p className="text-sm text-slate-600">
        {state.status === "unsupported"
          ? "This browser does not report storage usage."
          : "Storage usage could not be read."}
      </p>
    );
  }

  const fraction = state.quota > 0 ? state.usage / state.quota : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-slate-900">
          {formatBytes(state.usage)} <span className="font-normal text-slate-500">used</span>
        </span>
        <span className="text-slate-500">of {formatBytes(state.quota)} available</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200"
        role="meter"
        aria-label="Browser storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(fraction, 1) * 100)}
      >
        <div
          className="h-full rounded-full bg-amber-500"
          style={{ width: `${Math.max(Math.min(fraction, 1) * 100, fraction > 0 ? 1 : 0)}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">
        {formatPercent(fraction)} of quota used.{" "}
        {state.persisted === true
          ? "Persistent storage is granted."
          : "Persistent storage is not yet granted, so the browser may clear data under storage pressure. Export inspections as JSON to keep a copy. Importing exported inspections is not currently supported."}
      </p>
    </div>
  );
}
