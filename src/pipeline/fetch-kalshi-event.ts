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
    const marketPrice = typeof market.yes_ask === "number" ? market.yes_ask / 100 : null;

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
