"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PhotoRecord } from "@/lib/domain/types";
import { describeStorageError } from "@/lib/storage/errors";
import { deletePhoto } from "@/lib/storage/photos";

export function DeletePhotoButton({ photo }: { photo: PhotoRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await deletePhoto(photo.id);
      // Reset before leaving: Next.js keeps this page mounted (hidden) after navigation.
      setOpen(false);
      setDeleting(false);
      router.replace(`/inspections/${photo.inspectionId}`);
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
        title="Delete this photograph?"
        description={
          <>
            <p>
              The original file <span className="font-medium text-slate-900">{photo.fileName}</span>, its thumbnail,
              caption, viewpoint and annotations will be permanently removed from this browser.
            </p>
            <p className="mt-2">
              Findings that use this photograph as evidence are kept, but the photograph is unlinked from them. Other
              photographs are not affected. This cannot be undone.
            </p>
          </>
        }
        confirmLabel={deleting ? "Deleting…" : "Delete photograph"}
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
