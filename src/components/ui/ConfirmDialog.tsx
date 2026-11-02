"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "./Button";
import { Callout } from "./Callout";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal confirmation built on the native `<dialog>` element, which provides
 * focus trapping, Escape handling and a backdrop without extra dependencies.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        // Escape key: keep React state as the source of truth.
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/60"
    >
      <div className="space-y-3 p-5">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <div id={descriptionId} className="text-sm text-slate-600">
          {description}
        </div>
        {error ? (
          <Callout tone="danger" title="Action failed">
            {error}
          </Callout>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-slate-50 px-5 py-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
