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
              caption and viewpoint will be permanently removed from this browser.
            </p>
            <p className="mt-2">Other photographs are not affected. This cannot be undone.</p>
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
