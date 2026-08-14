import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { calculateMarketEdge } from "@/lib/market-edge";
import { predictions, type Prediction, type PredictionConfigVersion } from "@/database/schemas";

import { completeStage, failStage, startStage } from "../stages";
import type { FieldMarketLeg } from "./fetch-field-kalshi-event";

/** True if a Kalshi leg's display name and an ESPN player's display name plausibly refer to the same person. */
function namesMatch(playerName: string, legName: string): boolean {
  const a = playerName.trim().toLowerCase();
  const b = legName.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Evaluates every priced leg of a field market independently — same
 * reasoning as the three-way soccer pipeline: each Kalshi leg is its own
 * binary contract (this player wins outright), so `calculateMarketEdge`'s
 * existing binary math is correct per leg unchanged, and nothing here
 * assumes the whole field's prices sum to 1 (a ~150-way book's overround
 * is large and each leg is priced independently).
 *
 * Only ever buys YES on the single best-edge leg, never multiple legs of
 * the same event simultaneously — betting several players in one field
 * at once is a portfolio problem (a win by any one of them is mutually
 * exclusive with the others), and sizing that correctly needs
 * portfolio-level Kelly, not `calculatePositionSize`'s single-bet Kelly.
 * Restricting to one leg per event sidesteps that: it's the same
 * single-bet problem every other pipeline already solves, so
 * `executeOrderStage`'s existing sizing can never over-commit bankroll
 * across a field the way betting multiple legs at once could.
 */
export async function calculateFieldMarketEdgeStage(
  predictionId: string,
  legs: FieldMarketLeg[],
  probabilitiesByPlayer: Map<string, number>,
  configVersion: PredictionConfigVersion,
  category?: string | null,
): Promise<Prediction> {
  const stageId = await startStage(predictionId, "calculate_market_edge");

  try {
    const { edgeThreshold } = configVersion;
    const evaluated = legs
      .map((leg) => {
        const matchedEntry = [...probabilitiesByPlayer.entries()].find(([name]) => namesMatch(name, leg.name));
        if (!matchedEntry) return null;
        const modelProbability = matchedEntry[1];
        return { leg, modelProbability, result: calculateMarketEdge(modelProbability, leg.price, edgeThreshold, category) };
      })
      .filter((e): e is NonNullable<typeof e> => e != null);

    if (evaluated.length === 0) {
      throw new Error("No priced leg matched a field player with a model probability.");
    }

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
        marketPrice: best.leg.price,
        modelProbability: best.modelProbability,
      })
      .where(eq(predictions.id, predictionId))
      .returning();

    await completeStage(stageId, "Field market edge calculated.", {
      decision: shouldBet ? "buy_yes" : "no_bet",
      chosenPlayer: best.leg.name,
      legsEvaluated: evaluated.length,
    });
    return updated;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
