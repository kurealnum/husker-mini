import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { executableYesAskDollars, getKalshiEvent, type KalshiEventResponse } from "@/lib/kalshi/client";
import { predictions } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

export class InvalidKalshiEventError extends Error {}

/** Raised when nothing is for sale on the market, so no buy can be priced against it. */
export class NoExecutableAskError extends Error {
  constructor(ticker: string) {
    super(`Kalshi market ${ticker} has no ask with size — nothing is for sale.`);
    this.name = "NoExecutableAskError";
  }
}

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

    // The price a buy of YES can cross right now, in probability terms (0-1).
    // Only the ask counts, and only with size behind it. Falling back to the
    // bid or the last trade produced a "market price" no buy could ever pay:
    // every downstream edge, and the limit price itself, came from a number
    // off the wrong side of the book.
    const marketPrice = executableYesAskDollars(market);
    if (marketPrice == null) {
      throw new NoExecutableAskError(market.ticker);
    }

    // A game event has exactly two per-team markets. Both tickers are recorded
    // because execute_order buys the YES leg of one of them — the priced market
    // for a "yes" bet, its sibling for a "no" bet. Anything other than two
    // markets leaves the sibling unset rather than guessing which leg is the
    // complement; execute_order fails loudly if it needs one that isn't there.
    const markets = response.event.markets;
    const oppositeMarket =
      markets.length === 2 ? markets.find((m) => m.ticker !== market.ticker) : undefined;

    // The opposite leg's own executable ask — never derived as `1 - marketPrice`.
    // That leg has its own order book and its own spread; a "no" bet is a YES
    // buy on this leg, so this is the price it actually pays. Can be null (no
    // ask with size on that leg yet), which just means a "no" bet can't be
    // scored or executed against it right now.
    const oppositeMarketPrice = oppositeMarket ? executableYesAskDollars(oppositeMarket) : null;

    await db
      .update(predictions)
      .set({
        eventTitle: response.event.title,
        kalshiMarketTicker: market.ticker,
        kalshiOppositeMarketTicker: oppositeMarket?.ticker ?? null,
        marketPrice,
        oppositeMarketPrice,
        status: "running",
      })
      .where(eq(predictions.id, predictionId));

    await completeStage(stageId, "Kalshi event fetched.", {
      eventStatus: response.event.status,
      marketStatus: market.status,
      marketTicker: market.ticker,
      oppositeMarketTicker: oppositeMarket?.ticker ?? null,
      oppositeMarketPrice,
    });

    return response;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
