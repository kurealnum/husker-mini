import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { calculateSettlementOutcome } from "@/lib/settlement";
import type { MarketSide } from "@/database/schemas";
import { predictions } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

/**
 * Finalizes a settled prediction: records the Kalshi-settled result, derives
 * win/loss and P&L from the recorded decision, and transitions the
 * prediction to `finished`. Kalshi's settlement is the source of truth for
 * the final result — this never re-derives the outcome from any other data
 * source.
 */
export async function finalizePredictionStage(predictionId: string, settledResult: MarketSide) {
  const stageId = await startStage(predictionId, "finalize_prediction");

  try {
    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId)).limit(1);
    if (!prediction) {
      throw new Error(`Prediction not found: ${predictionId}`);
    }

    const outcome = calculateSettlementOutcome(prediction, settledResult);

    const [finished] = await db
      .update(predictions)
      .set({
        settledResult,
        finishedAt: new Date(),
        status: "finished",
        ...outcome,
      })
      .where(eq(predictions.id, predictionId))
      .returning();

    await completeStage(stageId, "Prediction finalized.", { settledResult, winLoss: outcome.winLoss });

    return finished;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
