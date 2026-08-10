"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * Form for submitting a Kalshi event ticker to start a new prediction.
 * On success, navigates to the prediction's progress page.
 */
export function NewPredictionForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim() }),
      });

      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "Failed to create prediction.");
        return;
      }

      router.push(`/predictions/${data.id}`);
    } catch {
      setError("Failed to create prediction.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Kalshi event ticker
        <input
          type="text"
          value={ticker}
          onChange={(event) => setTicker(event.target.value.toUpperCase())}
          placeholder="e.g. KXNFLGAME-25AUG09DEN"
          required
          className="rounded border bg-background px-3 py-2 font-mono text-sm"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Creating..." : "Create prediction"}
      </Button>
    </form>
  );
}
