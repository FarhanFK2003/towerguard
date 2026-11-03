"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Inspection } from "@/lib/domain/types";
import { describeStorageError } from "@/lib/storage/errors";
import { deleteInspection } from "@/lib/storage/inspections";

export function DeleteInspectionButton({ inspection }: { inspection: Inspection }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);
  const finalised = inspection.status === "finalised";

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await deleteInspection(inspection.id);
      // Reset before leaving: Next.js keeps this page mounted (hidden) after navigation.
      setOpen(false);
      setDeleting(false);
      setUnderstood(false);
      router.replace("/");
    } catch (err) {
      setError(describeStorageError(err));
      setDeleting(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden="true" />
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        title={finalised ? "Delete this finalised inspection?" : "Delete this inspection?"}
        description={
          <>
            {finalised ? (
              <p className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 font-medium text-red-800">
                This inspection is finalised. Deleting it permanently removes its completed documentation record.
              </p>
            ) : null}
            <p>
              <span className="font-medium text-slate-900">{inspection.siteName}</span> (
              <span className="font-mono">{inspection.siteId}</span>) and all of its photographs,
              annotations and findings will be permanently removed from this browser.
            </p>
            <p className="mt-2">This cannot be undone.</p>
            {finalised ? (
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-slate-800">
                <input
                  type="checkbox"
                  data-testid="confirm-delete-finalised"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-0.5 size-4 accent-red-600"
                />
                I understand that this permanently deletes a finalised inspection and all of its evidence.
              </label>
            ) : null}
          </>
        }
        confirmLabel={deleting ? "Deleting…" : finalised ? "Delete finalised inspection" : "Delete inspection"}
        busy={deleting}
        confirmDisabled={finalised && !understood}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => {
          setOpen(false);
          setError(null);
          setUnderstood(false);
        }}
      />
    </>
  );
}
