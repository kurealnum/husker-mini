/**
 * Settlement worker entrypoint. Every poll interval, checks every prediction
 * `waiting_for_result` against Kalshi. If Kalshi has settled the market, the
 * prediction is finalized; otherwise it is left untouched for the next poll.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getKalshiEvent } from "@/lib/kalshi/client";
import { predictions } from "@/database/schemas";
import type { MarketSide } from "@/database/schemas";
import { finalizePredictionStage } from "@/pipeline/finalize-prediction";

const POLL_INTERVAL_MS = Number(process.env.SETTLEMENT_WORKER_POLL_INTERVAL_MS ?? 60000);

/** Reads a settled market's winning side, or `null` if it has not settled yet. */
function getSettledResult(result: string | undefined): MarketSide | null {
  return result === "yes" || result === "no" ? result : null;
}

/**
 * Queries Kalshi for one prediction's event. If the market has settled,
 * finalizes the prediction; otherwise leaves it unchanged.
 */
async function checkSettlement(predictionId: string, ticker: string): Promise<void> {
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
async function checkWaitingPredictions(): Promise<void> {
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

async function pollLoop(): Promise<void> {
  try {
    await checkWaitingPredictions();
  } catch (error) {
    console.error("Settlement worker poll iteration failed:", error);
  } finally {
    setTimeout(pollLoop, POLL_INTERVAL_MS);
  }
}

async function main() {
  console.log("Settlement worker started.");
  // Check all unfinished predictions immediately on startup — a restart must
  // not delay noticing a settlement that happened while the worker was down.
  await pollLoop();
}

main();

export {};
