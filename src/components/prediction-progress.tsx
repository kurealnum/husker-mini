"use client";

import { useEffect, useState } from "react";

import type { Prediction, PredictionStage } from "@/database/schemas";

/** Statuses considered still in-flight; polling stops once the prediction leaves this set. */
const ACTIVE_STATUSES: Prediction["status"][] = ["pending", "running"];

const POLL_INTERVAL_MS = 3000;

const STAGE_ICON: Record<PredictionStage["status"], string> = {
  completed: "✓",
  running: "●",
  pending: "○",
  failed: "✗",
};

/** Renders a human-friendly label for a snake_case pipeline stage name. */
function formatStageLabel(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface PredictionProgressData {
  prediction: Prediction;
  stages: PredictionStage[];
}

/**
 * Displays the live progress of a prediction's pipeline stages, polling the
 * backend periodically while the prediction is still `pending`/`running`.
 */
export function PredictionProgress({ predictionId, initialData }: {
  predictionId: string;
  initialData: PredictionProgressData;
}) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    if (!ACTIVE_STATUSES.includes(data.prediction.status)) {
      return;
    }

    const interval = setInterval(async () => {
      const response = await fetch(`/api/predictions/${predictionId}`);
      if (!response.ok) return;
      const next = (await response.json()) as PredictionProgressData;
      setData(next);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [predictionId, data.prediction.status]);

  if (!ACTIVE_STATUSES.includes(data.prediction.status)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4 font-mono text-sm">
      {data.stages.length === 0 && <span className="text-muted-foreground">Waiting to start...</span>}
      {data.stages.map((stage) => (
        <div key={stage.id} className="flex items-center gap-2">
          <span
            className={
              stage.status === "failed"
                ? "text-destructive"
                : stage.status === "completed"
                  ? "text-foreground"
                  : "text-muted-foreground"
            }
          >
            {STAGE_ICON[stage.status]}
          </span>
          <span>{formatStageLabel(stage.stage)}</span>
        </div>
      ))}
    </div>
  );
}
