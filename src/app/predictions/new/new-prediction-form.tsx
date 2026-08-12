"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <Label className="flex flex-col items-start gap-1">
        Kalshi event ticker
        <Input
          type="text"
          value={ticker}
          onChange={(event) => setTicker(event.target.value.toUpperCase())}
          placeholder="e.g. KXNFLGAME-25AUG09DEN"
          required
          className="font-mono"
        />
      </Label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Creating..." : "Create prediction"}
      </Button>
    </form>
  );
}
