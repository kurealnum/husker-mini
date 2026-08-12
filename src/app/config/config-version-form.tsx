"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { PredictionConfigVersion } from "@/database/schemas";

/**
 * Global fields apply across the whole pipeline (the three phase weights and
 * the edge threshold). Everything else is a per-phase tunable parameter and
 * lives in that phase's own subsection, so adding a new tunable to one phase
 * never touches the others.
 */
const GLOBAL_FIELDS = [
  { key: "technicalWeight", label: "Technical Weight" },
  { key: "espnWeight", label: "ESPN Weight" },
  { key: "combinerWeight", label: "Combiner Weight" },
  { key: "edgeThreshold", label: "Edge Threshold" },
] as const;

const SUBSECTIONS = [
  {
    title: "Technical (team scores / game progress)",
    fields: [{ key: "technicalK", label: "Technical K" }] as const,
  },
  {
    title: "ESPN analysis",
    fields: [] as const,
  },
  {
    title: "Combiner (LLM)",
    fields: [] as const,
  },
] as const;

const FIELDS = [...GLOBAL_FIELDS, ...SUBSECTIONS.flatMap((s) => s.fields)];

type FieldKey = (typeof FIELDS)[number]["key"];

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: { key: FieldKey; label: string };
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {field.label}
      <input
        type="number"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="rounded border bg-background px-3 py-2 font-mono text-sm"
      />
    </label>
  );
}

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
    espnWeight: active ? String(active.espnWeight) : "",
    combinerWeight: active ? String(active.combinerWeight) : "",
    edgeThreshold: active ? String(active.edgeThreshold) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(key: FieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

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
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Global</legend>
        {GLOBAL_FIELDS.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(value) => setField(field.key, value)}
          />
        ))}
      </fieldset>

      {SUBSECTIONS.map((subsection) => (
        <fieldset key={subsection.title} className="flex flex-col gap-3">
          <legend className="text-sm font-semibold">{subsection.title}</legend>
          {subsection.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tunable parameters yet.</p>
          ) : (
            subsection.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={(value) => setField(field.key, value)}
              />
            ))
          )}
        </fieldset>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Saving..." : "Save as new version"}
      </Button>
    </form>
  );
}
