"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PredictionConfigVersion } from "@/database/schemas";

type FieldKey =
  | "technicalWeight"
  | "espnWeight"
  | "combinerWeight"
  | "edgeThreshold"
  | "technicalK"
  | "combinerModel";
type FieldDef = { key: FieldKey; label: string; type: "number" | "text" };

/**
 * Global fields apply across the whole pipeline (the three phase weights and
 * the edge threshold). Everything else is a per-phase tunable parameter and
 * lives in that phase's own subsection, so adding a new tunable to one phase
 * never touches the others.
 */
const GLOBAL_FIELDS: FieldDef[] = [
  { key: "technicalWeight", label: "Technical Weight", type: "number" },
  { key: "espnWeight", label: "ESPN Weight", type: "number" },
  { key: "combinerWeight", label: "Combiner Weight", type: "number" },
  { key: "edgeThreshold", label: "Edge Threshold", type: "number" },
];

const SUBSECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Technical (team scores / game progress)",
    fields: [{ key: "technicalK", label: "Technical K", type: "number" }],
  },
  {
    title: "ESPN analysis",
    fields: [],
  },
  {
    title: "Combiner (LLM)",
    fields: [{ key: "combinerModel", label: "OpenAI Model", type: "text" }],
  },
];

const FIELDS: FieldDef[] = [...GLOBAL_FIELDS, ...SUBSECTIONS.flatMap((s) => s.fields)];

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Label className="flex flex-col items-start gap-1">
      {field.label}
      <Input
        type={field.type}
        step={field.type === "number" ? "any" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="font-mono"
      />
    </Label>
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
    combinerModel: active ? active.combinerModel : "",
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
      const body: Record<string, number | string> = {};
      for (const field of FIELDS) {
        const raw = values[field.key];
        if (field.type === "number") {
          const value = Number(raw);
          if (!Number.isFinite(value)) {
            setError(`${field.label} must be a number.`);
            setSubmitting(false);
            return;
          }
          body[field.key] = value;
        } else {
          if (!raw.trim()) {
            setError(`${field.label} is required.`);
            setSubmitting(false);
            return;
          }
          body[field.key] = raw.trim();
        }
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
