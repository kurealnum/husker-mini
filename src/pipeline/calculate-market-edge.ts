import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getPredictionConfig } from "@/lib/config/prediction-config";
import { calculateMarketEdge } from "@/lib/market-edge";
import { predictions } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

/**
 * Calculates raw/net edge against the Kalshi market price and decides
 * buy_yes / buy_no / no_bet, persisting the result on the prediction.
 */
export async function calculateMarketEdgeStage(
  predictionId: string,
  modelProbability: number,
  marketPrice: number,
) {
  const stageId = await startStage(predictionId, "calculate_market_edge");

  try {
    const { edgeThreshold } = getPredictionConfig();
    if (!Number.isFinite(edgeThreshold)) {
      throw new Error("PREDICTION_EDGE_THRESHOLD must be configured.");
    }

    const result = calculateMarketEdge(modelProbability, marketPrice, edgeThreshold);
    const predictedSide = result.decision === "buy_yes" ? "yes" : result.decision === "buy_no" ? "no" : null;

    const [updated] = await db
      .update(predictions)
      .set({
        rawEdge: result.rawEdge,
        feesCents: result.feeCents,
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
