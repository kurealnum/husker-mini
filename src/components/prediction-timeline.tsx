import type { PredictionStage } from "@/database/schemas";

function formatStageLabel(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour12: false });
}

/**
 * Chronological, read-only log of every persisted pipeline stage for a
 * prediction — including stages from before and after settlement. Unlike
 * `PredictionProgress`, this always renders the full history and never
 * polls, so it remains useful after the prediction has finished.
 */
export function PredictionTimeline({ stages }: { stages: PredictionStage[] }) {
  if (stages.length === 0) {
    return <p className="text-sm text-muted-foreground">No stage history yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-1 font-mono text-sm">
      {stages.map((stage) => (
        <li key={stage.id} className="flex gap-3">
          <span className="text-muted-foreground">{formatTime(stage.startedAt)}</span>
          <span className={stage.status === "failed" ? "text-destructive" : ""}>
            {formatStageLabel(stage.stage)}
            {stage.status === "failed" && " (failed)"}
            {stage.status === "running" && " (running)"}
          </span>
        </li>
      ))}
    </ol>
  );
}
