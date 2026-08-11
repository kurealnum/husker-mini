"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui/react/alert-dialog";

import { Button } from "@/components/ui/button";

/** Deletes a prediction (and its cascaded rows) after user confirmation. */
export function DeletePredictionButton({ predictionId }: { predictionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/predictions/${predictionId}`, { method: "DELETE" });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "Failed to delete prediction.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Failed to delete prediction.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger render={<Button variant="destructive" size="sm" />}>Delete</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-black/50" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 flex w-80 -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg border bg-background p-6 shadow-lg">
          <AlertDialog.Title className="text-lg font-semibold">Delete prediction?</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground">
            This will permanently delete this prediction and all its analysis data. This cannot be undone.
          </AlertDialog.Description>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <AlertDialog.Close render={<Button variant="outline" disabled={submitting} />}>
              Cancel
            </AlertDialog.Close>
            <Button variant="destructive" disabled={submitting} onClick={handleDelete}>
              {submitting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
