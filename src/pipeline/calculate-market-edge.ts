import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { calculateMarketEdge } from "@/lib/market-edge";
import { predictions, type PredictionConfigVersion } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

/**
 * Calculates raw/net edge against the Kalshi market price and decides
 * buy_yes / buy_no / no_bet, persisting the result on the prediction.
 */
export async function calculateMarketEdgeStage(
  predictionId: string,
  modelProbability: number,
  marketPrice: number,
  configVersion: PredictionConfigVersion,
  category?: string | null,
) {
  const stageId = await startStage(predictionId, "calculate_market_edge");

  try {
    const { edgeThreshold } = configVersion;
    const result = calculateMarketEdge(modelProbability, marketPrice, edgeThreshold, category);
    const predictedSide = result.decision === "buy_yes" ? "yes" : result.decision === "buy_no" ? "no" : null;

    // fees_cents is a whole-order fee, only known once execute_order settles
    // on a fill count and price — it's written there, not here.
    const [updated] = await db
      .update(predictions)
      .set({
        rawEdge: result.rawEdge,
        netEdge: result.netEdge,
        decision: result.decision,
        predictedSide,
      })
      .where(eq(predictions.id, predictionId))
      .returning();

    await completeStage(stageId, "Market edge calculated.", { decision: result.decision });
    return updated;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
