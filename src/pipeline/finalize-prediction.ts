import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import type { MarketSide } from "@/database/schemas";
import { predictions } from "@/database/schemas";

/**
 * Records a Kalshi-settled result on a prediction and moves it to
 * `finished`. Kalshi's settlement is the source of truth: this does not
 * re-derive the outcome from any other data source.
 */
export async function finalizePredictionStage(predictionId: string, settledResult: MarketSide) {
  const [finished] = await db
    .update(predictions)
    .set({
      settledResult,
      status: "finished",
      finishedAt: new Date(),
    })
    .where(eq(predictions.id, predictionId))
    .returning();

  return finished;
}
