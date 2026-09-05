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
export async function checkSettlement(
  predictionId: string,
  ticker: string,
  marketTicker: string | null,
): Promise<void> {
  const response = await getKalshiEvent(ticker);
  const markets = response.event?.markets ?? [];

  let market;
  if (marketTicker) {
    market = markets.find((m) => m.ticker === marketTicker);
    if (!market) {
      console.error(
        `Prediction ${predictionId}: priced market ${marketTicker} not found in event ${ticker}'s ` +
          `response; leaving it waiting rather than guessing.`,
      );
      return;
    }
  } else {
    // Older rows predate kalshi_market_ticker being recorded — fall back to
    // the first market, same as before, but make the fallback visible.
    console.warn(
      `Prediction ${predictionId}: no priced market ticker recorded; falling back to markets[0] for event ${ticker}.`,
    );
    market = markets[0];
  }

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
    .select({
      id: predictions.id,
      kalshiEventTicker: predictions.kalshiEventTicker,
      kalshiMarketTicker: predictions.kalshiMarketTicker,
    })
    .from(predictions)
    .where(eq(predictions.status, "waiting_for_result"));

  for (const prediction of waiting) {
    try {
      await checkSettlement(prediction.id, prediction.kalshiEventTicker, prediction.kalshiMarketTicker);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Settlement check for prediction ${prediction.id} failed: ${message}`);
    }
  }
}
