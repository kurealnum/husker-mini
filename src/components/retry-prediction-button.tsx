"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/** Requeues a failed prediction by resetting its status back to `pending`. */
export function RetryPredictionButton({ predictionId }: { predictionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRetry() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/predictions/${predictionId}/retry`, { method: "POST" });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "Failed to retry prediction.");
        return;
      }

      router.refresh();
    } catch {
      setError("Failed to retry prediction.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" disabled={submitting} onClick={handleRetry}>
        {submitting ? "Retrying..." : "Retry"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
