"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { PredictionConfigVersion } from "@/database/schemas";

const FIELDS = [
  { key: "technicalK", label: "Technical K" },
  { key: "technicalWeight", label: "Technical Weight" },
  { key: "sentimentWeight", label: "Sentiment Weight" },
  { key: "edgeThreshold", label: "Edge Threshold" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

/**
 * Form for creating a new prediction config version, pre-filled with the
 * current active version's values. Submitting always inserts a new version
 * rather than editing the active one in place.
 */
export function ConfigVersionForm({ active }: { active: PredictionConfigVersion | null }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<FieldKey, string>>({
    technicalK: active ? String(active.technicalK) : "",
    technicalWeight: active ? String(active.technicalWeight) : "",
    sentimentWeight: active ? String(active.sentimentWeight) : "",
    edgeThreshold: active ? String(active.edgeThreshold) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const body: Record<string, number> = {};
      for (const field of FIELDS) {
        const value = Number(values[field.key]);
        if (!Number.isFinite(value)) {
          setError(`${field.label} must be a number.`);
          setSubmitting(false);
          return;
        }
        body[field.key] = value;
      }

      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to create config version.");
        return;
      }

      router.refresh();
    } catch {
      setError("Failed to create config version.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-3">
      {FIELDS.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-sm font-medium">
          {field.label}
          <input
            type="number"
            step="any"
            value={values[field.key]}
            onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
            required
            className="rounded border bg-background px-3 py-2 font-mono text-sm"
          />
        </label>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Saving..." : "Save as new version"}
      </Button>
    </form>
  );
}
