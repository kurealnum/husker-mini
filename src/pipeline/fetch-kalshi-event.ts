import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getKalshiEvent, type KalshiEventResponse } from "@/lib/kalshi/client";
import { predictions } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

export class InvalidKalshiEventError extends Error {}

/**
 * Fetches the Kalshi event/market data for a prediction's ticker and saves
 * the event title, current executable market price, and status. Returns the
 * raw API response so later stages can build the prediction snapshot.
 */
export async function fetchKalshiEventStage(
  predictionId: string,
  ticker: string,
): Promise<KalshiEventResponse> {
  const stageId = await startStage(predictionId, "fetch_kalshi_event");

  try {
    const response = await getKalshiEvent(ticker);
    const market = response.event?.markets?.[0];

    if (!response.event || !market) {
      throw new InvalidKalshiEventError(`Kalshi event ${ticker} has no active market.`);
    }

    // The executable price to buy YES right now, in probability terms (0-1).
    // Kalshi reports these as dollar-scale strings (e.g. "0.6700"), not cent
    // integers. A quote with 0 size is a stale placeholder, not real
    // liquidity, so it's skipped in favor of the next fallback: ask (with
    // size) -> bid (with size) -> last trade -> fail.
    const hasSize = (sizeFp: string | undefined) => sizeFp != null && Number(sizeFp) > 0;
    const yesPriceDollars =
      (hasSize(market.yes_ask_size_fp) ? market.yes_ask_dollars : undefined) ??
      (hasSize(market.yes_bid_size_fp) ? market.yes_bid_dollars : undefined) ??
      market.last_price_dollars;
    const marketPrice = yesPriceDollars != null ? Number(yesPriceDollars) : NaN;
    if (!Number.isFinite(marketPrice)) {
      throw new InvalidKalshiEventError(`Kalshi market for ${ticker} has no executable yes price.`);
    }

    await db
      .update(predictions)
      .set({
        eventTitle: response.event.title,
        marketPrice,
        status: "running",
      })
      .where(eq(predictions.id, predictionId));

    await completeStage(stageId, "Kalshi event fetched.", {
      eventStatus: response.event.status,
      marketStatus: market.status,
    });

    return response;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
