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
  return row.id;
}

export async function completeStage(
  stageId: string,
  message?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db
    .update(predictionStages)
    .set({ status: "completed", message, metadata, completedAt: new Date() })
    .where(eq(predictionStages.id, stageId));
}

export async function failStage(stageId: string, message: string): Promise<void> {
  await db
    .update(predictionStages)
    .set({ status: "failed", message, completedAt: new Date() })
    .where(eq(predictionStages.id, stageId));
}
