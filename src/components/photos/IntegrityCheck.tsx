"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PhotoRecord } from "@/lib/domain/types";
import { sha256Hex } from "@/lib/photos/hash";
import { describeStorageError } from "@/lib/storage/errors";
import { getPhotoOriginal } from "@/lib/storage/photos";

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "match" }
  | { status: "mismatch"; detail: string }
  | { status: "error"; message: string };

/** Re-hashes the stored original and compares it with the hash recorded at upload. */
export function IntegrityCheck({ photo }: { photo: PhotoRecord }) {
  const [state, setState] = useState<CheckState>({ status: "idle" });

  async function verify() {
    setState({ status: "checking" });
    try {
      const original = await getPhotoOriginal(photo.id);
      if (!original) {
        setState({ status: "error", message: "The original image data is missing." });
        return;
      }
      const hash = await sha256Hex(original);
      if (hash === photo.sha256 && original.size === photo.sizeBytes) {
        setState({ status: "match" });
      } else {
        setState({
          status: "mismatch",
          detail: `Stored file: ${original.size} bytes, SHA-256 ${hash}.`,
        });
      }
    } catch (error) {
      setState({ status: "error", message: describeStorageError(error) });
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" onClick={verify} disabled={state.status === "checking"}>
        {state.status === "checking" ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
        Verify integrity
      </Button>
      <div role="status" aria-live="polite" className="text-sm">
        {state.status === "match" ? (
          <p className="flex items-start gap-1.5 text-emerald-700">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            The stored original matches the SHA-256 recorded at upload.
          </p>
        ) : state.status === "mismatch" ? (
          <p className="flex items-start gap-1.5 text-red-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              The stored original does not match the recorded hash. <span className="break-all">{state.detail}</span>
            </span>
          </p>
        ) : state.status === "error" ? (
          <p className="flex items-start gap-1.5 text-red-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
