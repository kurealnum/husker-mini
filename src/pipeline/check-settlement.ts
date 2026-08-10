import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getKalshiEvent } from "@/lib/kalshi/client";
import { predictions } from "@/database/schemas";
import type { MarketSide } from "@/database/schemas";

import { finalizePredictionStage } from "./finalize-prediction";

/** Reads a settled market's winning side, or `null` if it has not settled yet. */
export function getSettledResult(result: string | undefined): MarketSide | null {
  return result === "yes" || result === "no" ? result : null;
}

/**
 * Queries Kalshi for one prediction's event. If the market has settled,
 * finalizes the prediction; otherwise leaves it unchanged. Safe to call
 * repeatedly for the same prediction: once finalized, it moves to
 * `finished` and `checkWaitingPredictions` no longer selects it, so a retry
 * (e.g. after a worker restart) never re-finalizes an already-settled
 * prediction.
 */
export async function checkSettlement(predictionId: string, ticker: string): Promise<void> {
  const response = await getKalshiEvent(ticker);
  const market = response.markets[0];
  const settledResult = getSettledResult(market?.result);

  if (!settledResult) {
    return;
  }

  await finalizePredictionStage(predictionId, settledResult);
  console.log(`Prediction ${predictionId} settled: ${settledResult}.`);
}

/** Checks every prediction currently waiting for a Kalshi result. */
export async function checkWaitingPredictions(): Promise<void> {
  const waiting = await db
    .select({ id: predictions.id, kalshiEventTicker: predictions.kalshiEventTicker })
    .from(predictions)
    .where(eq(predictions.status, "waiting_for_result"));

  for (const prediction of waiting) {
    try {
      await checkSettlement(prediction.id, prediction.kalshiEventTicker);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Settlement check for prediction ${prediction.id} failed: ${message}`);
    }
  }
}
