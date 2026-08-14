import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { calculateMarketEdge } from "@/lib/market-edge";
import { predictions, type Prediction, type PredictionConfigVersion } from "@/database/schemas";

import { completeStage, failStage, startStage } from "../stages";

/** One evaluated leg: which outcome it represents, its Kalshi ticker/price, and the model's probability for it. */
export interface ThreeWayMarketLeg {
  outcome: "team1" | "team2" | "draw";
  ticker: string;
  marketPrice: number;
  modelProbability: number;
}

/**
 * Evaluates all three legs of a three-way market independently. Each
 * Kalshi leg (team1-yes, team2-yes, draw-yes) is its own binary contract
 * settled on its own — `calculateMarketEdge`'s existing binary math
 * (rawEdge = modelProbability - marketPrice) is correct per leg exactly as
 * written, unchanged. Nothing here assumes the three market prices sum to
 * 1 — they generally won't, since the book prices each leg (including its
 * own fee/vig) independently rather than as a partition of one dollar.
 *
 * Picks whichever leg has the best net edge, provided that leg's own edge
 * calculation actually clears `buy_yes` — never `buy_no`: buying "no" on
 * a single three-way leg means betting on the other two legs combined,
 * which isn't a coherent single position the way it is for a two-leg
 * head-to-head market (where "no" on one leg is exactly "yes" on the
 * other, already handled by routing to that leg's own ticker). A
 * three-way bet only ever buys YES on the one leg it favors.
 */
export async function calculateThreeWayMarketEdgeStage(
  predictionId: string,
  legs: ThreeWayMarketLeg[],
  configVersion: PredictionConfigVersion,
  category?: string | null,
): Promise<Prediction> {
  const stageId = await startStage(predictionId, "calculate_market_edge");

  try {
    const { edgeThreshold } = configVersion;
    const evaluated = legs.map((leg) => ({
      leg,
      result: calculateMarketEdge(leg.modelProbability, leg.marketPrice, edgeThreshold, category),
    }));

    const best = evaluated.reduce((a, b) => (b.result.netEdge > a.result.netEdge ? b : a));
    const shouldBet = best.result.decision === "buy_yes";

    const [updated] = await db
      .update(predictions)
      .set({
        rawEdge: best.result.rawEdge,
        feesCents: best.result.feeCents,
        netEdge: best.result.netEdge,
        decision: shouldBet ? "buy_yes" : "no_bet",
        predictedSide: shouldBet ? "yes" : null,
        kalshiMarketTicker: best.leg.ticker,
        marketPrice: best.leg.marketPrice,
        modelProbability: best.leg.modelProbability,
      })
      .where(eq(predictions.id, predictionId))
      .returning();

    await completeStage(stageId, "Three-way market edge calculated.", {
      decision: shouldBet ? "buy_yes" : "no_bet",
      chosenOutcome: best.leg.outcome,
    });
    return updated;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
