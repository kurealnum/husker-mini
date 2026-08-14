import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { executableYesAskDollars, getKalshiEvent, type KalshiEventResponse, type KalshiMarket } from "@/lib/kalshi/client";
import { predictions } from "@/database/schemas";

import { completeStage, failStage, startStage } from "../stages";

export class InvalidFieldEventError extends Error {}

/** One player's leg: Kalshi ticker, current executable price, and display name. */
export interface FieldMarketLeg {
  ticker: string;
  price: number;
  name: string;
}

/**
 * Fetches a field (golf) Kalshi event and returns every player leg with an
 * executable ask — unlike the shared `fetchKalshiEventStage` (exactly one
 * priced market plus its complement) or the three-way fetch (exactly
 * three), a field event can have anywhere from a handful of markets (an
 * early-withdrawal-heavy field) up to ~150. A leg with nothing for sale is
 * skipped rather than failing the whole event — one illiquid long-shot
 * shouldn't block pricing every other player in the field.
 */
export async function fetchFieldKalshiEventStage(
  predictionId: string,
  ticker: string,
): Promise<{ response: KalshiEventResponse; legs: FieldMarketLeg[] }> {
  const stageId = await startStage(predictionId, "fetch_kalshi_event");

  try {
    const response = await getKalshiEvent(ticker);
    const allMarkets = response.event?.markets ?? [];
    if (!response.event || allMarkets.length < 2) {
      throw new InvalidFieldEventError(`Kalshi event ${ticker} does not have a field of markets (found ${allMarkets.length}).`);
    }

    const toLeg = (market: KalshiMarket): FieldMarketLeg | null => {
      const price = executableYesAskDollars(market);
      if (price == null) return null;
      return { ticker: market.ticker, price, name: market.yes_sub_title ?? market.ticker };
    };

    const legs = allMarkets.map(toLeg).filter((leg): leg is FieldMarketLeg => leg != null);
    if (legs.length === 0) {
      throw new InvalidFieldEventError(`Kalshi event ${ticker} has no leg with an executable ask.`);
    }

    await db
      .update(predictions)
      .set({ eventTitle: response.event.title, status: "running" })
      .where(eq(predictions.id, predictionId));

    await completeStage(stageId, "Field Kalshi event fetched.", {
      totalMarkets: allMarkets.length,
      pricedLegs: legs.length,
    });

    return { response, legs };
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
