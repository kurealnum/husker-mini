import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictionStages } from "@/database/schemas";

/** Records the start of a pipeline stage and returns its id for completion/failure. */
export async function startStage(
  predictionId: string,
  stage: string,
  message?: string,
): Promise<string> {
  const [row] = await db
    .insert(predictionStages)
    .values({
      predictionId,
      stage,
      status: "running",
      message,
      startedAt: new Date(),
    })
    .returning({ id: predictionStages.id });
  console.log(`[pipeline] ${predictionId} ${stage}: started${message ? ` — ${message}` : ""}`);
  return row.id;
}

export async function completeStage(
  stageId: string,
  message?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const [row] = await db
    .update(predictionStages)
    .set({ status: "completed", message, metadata, completedAt: new Date() })
    .where(eq(predictionStages.id, stageId))
    .returning({ predictionId: predictionStages.predictionId, stage: predictionStages.stage });
  console.log(
    `[pipeline] ${row?.predictionId} ${row?.stage}: completed${message ? ` — ${message}` : ""}`,
  );
}

export async function failStage(stageId: string, message: string): Promise<void> {
  const [row] = await db
    .update(predictionStages)
    .set({ status: "failed", message, completedAt: new Date() })
    .where(eq(predictionStages.id, stageId))
    .returning({ predictionId: predictionStages.predictionId, stage: predictionStages.stage });
  console.error(`[pipeline] ${row?.predictionId} ${row?.stage}: FAILED — ${message}`);
}
