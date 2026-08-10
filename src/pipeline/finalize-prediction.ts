import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import type { MarketSide, Prediction } from "@/database/schemas";
import { predictions } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

/** Assumed contracts per paper trade — no bankroll/position sizing exists yet. */
const ASSUMED_CONTRACTS = 1;

interface SettlementOutcome {
  winLoss: Prediction["winLoss"];
  pnlCents: number | null;
  returnPercentage: number | null;
}

/**
 * Derives win/loss and P&L for a settled prediction. Only `buy_yes`/`buy_no`
 * decisions can win or lose money; `no_bet` (or a missing decision) never
 * traded, so there is nothing to settle financially.
 *
 * A winning contract pays out 100 cents; a losing one pays nothing. The
 * entry price is derived from the market price recorded at decision time
 * (there is no separate executed-order price, since no real order is
 * placed), using the complementary price for a `buy_no` decision.
 */
function calculateSettlementOutcome(prediction: Prediction, settledResult: MarketSide): SettlementOutcome {
  if (!prediction.decision || prediction.decision === "no_bet" || !prediction.predictedSide) {
    return { winLoss: null, pnlCents: null, returnPercentage: null };
  }
  if (prediction.marketPrice == null) {
    return { winLoss: null, pnlCents: null, returnPercentage: null };
  }

  const entryPrice =
    prediction.predictedSide === "yes" ? prediction.marketPrice : 1 - prediction.marketPrice;
  const entryPriceCents = Math.round(entryPrice * 100);
  const feesCents = prediction.feesCents ?? 0;
  const won = prediction.predictedSide === settledResult;

  const pnlCents = won
    ? (100 - entryPriceCents) * ASSUMED_CONTRACTS - feesCents
    : -(entryPriceCents * ASSUMED_CONTRACTS) - feesCents;

  const costCents = entryPriceCents * ASSUMED_CONTRACTS;
  const returnPercentage = costCents > 0 ? pnlCents / costCents : null;

  return { winLoss: won ? "win" : "loss", pnlCents, returnPercentage };
}

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
