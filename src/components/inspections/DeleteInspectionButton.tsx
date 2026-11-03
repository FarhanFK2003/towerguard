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

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await deleteInspection(inspection.id);
      // Reset before leaving: Next.js keeps this page mounted (hidden) after navigation.
      setOpen(false);
      setDeleting(false);
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
        title="Delete this inspection?"
        description={
          <>
            <p>
              <span className="font-medium text-slate-900">{inspection.siteName}</span> (
              <span className="font-mono">{inspection.siteId}</span>) and all of its photographs,
              annotations and findings will be permanently removed from this browser.
            </p>
            <p className="mt-2">This cannot be undone.</p>
          </>
        }
        confirmLabel={deleting ? "Deleting…" : "Delete inspection"}
        busy={deleting}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
