"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PredictionConfigVersion } from "@/database/schemas";
import type { ConfigFieldDef } from "@/pipeline/pipeline-contract";

/**
 * Global fields apply across the whole pipeline (the three phase weights and
 * the edge threshold) — every pipeline shape uses these.
 */
const GLOBAL_FIELDS: ConfigFieldDef[] = [
  { key: "technicalWeight", label: "Technical Weight", type: "number" },
  { key: "espnWeight", label: "ESPN Weight", type: "number" },
  { key: "combinerWeight", label: "Combiner Weight", type: "number" },
  { key: "edgeThreshold", label: "Edge Threshold", type: "number" },
];

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDef;
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
 * Form for creating a new prediction config version for one league,
 * pre-filled with that league's current active version's values.
 * Submitting always inserts a new version rather than editing the active
 * one in place. The pipeline-specific field list (`configFields`) is driven
 * by the league's registered pipeline (`SportPipeline.configFields`), so a
 * pipeline with no technical-formula phase never shows a `technicalK` input.
 */
export function ConfigVersionForm({
  league,
  active,
  configFields,
}: {
  league: string;
  active: PredictionConfigVersion | null;
  configFields: ConfigFieldDef[];
}) {
  const router = useRouter();
  const fields = [...GLOBAL_FIELDS, ...configFields];

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      const activeValue = active ? (active as unknown as Record<string, unknown>)[field.key] : undefined;
      initial[field.key] = activeValue != null ? String(activeValue) : "";
    }
    return initial;
  });
  const [tradingMode, setTradingMode] = useState<"paper" | "live">(active?.tradingMode ?? "paper");
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(active?.killSwitchEnabled ?? false);
  const [backtestAccuracy, setBacktestAccuracy] = useState(
    active?.backtestAccuracy != null ? String(active.backtestAccuracy) : "",
  );
  const [backtestThreshold, setBacktestThreshold] = useState(
    active?.backtestThreshold != null ? String(active.backtestThreshold) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const body: Record<string, number | string | boolean> = { league, tradingMode, killSwitchEnabled };
      for (const field of fields) {
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

      if (backtestAccuracy.trim()) {
        body.backtestAccuracy = Number(backtestAccuracy);
      }
      if (backtestThreshold.trim()) {
        body.backtestThreshold = Number(backtestThreshold);
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

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Pipeline-specific</legend>
        {configFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">This pipeline has no tunable parameters yet.</p>
        ) : (
          configFields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(value) => setField(field.key, value)}
            />
          ))
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Trading mode &amp; safety gate</legend>
        <Label className="flex flex-col items-start gap-1">
          Trading mode
          <select
            value={tradingMode}
            onChange={(event) => setTradingMode(event.target.value as "paper" | "live")}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="paper">Paper</option>
            <option value="live">Live</option>
          </select>
        </Label>
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={killSwitchEnabled}
            onChange={(event) => setKillSwitchEnabled(event.target.checked)}
          />
          Kill switch (stops new predictions for this league)
        </Label>
        <Label className="flex flex-col items-start gap-1">
          Backtest accuracy
          <Input
            type="number"
            step="any"
            value={backtestAccuracy}
            onChange={(event) => setBacktestAccuracy(event.target.value)}
            className="font-mono"
            placeholder="required to enable live mode"
          />
        </Label>
        <Label className="flex flex-col items-start gap-1">
          Backtest threshold
          <Input
            type="number"
            step="any"
            value={backtestThreshold}
            onChange={(event) => setBacktestThreshold(event.target.value)}
            className="font-mono"
            placeholder="required to enable live mode"
          />
        </Label>
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Saving..." : "Save as new version"}
      </Button>
    </form>
  );
}
