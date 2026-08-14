import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { executableYesAskDollars, getKalshiEvent, type KalshiEventResponse, type KalshiMarket } from "@/lib/kalshi/client";
import { predictions } from "@/database/schemas";

import { completeStage, failStage, startStage } from "../stages";

export class InvalidThreeWayEventError extends Error {}

/** One leg's Kalshi ticker, current executable price, and display name (team name, or "Tie"). */
export interface ThreeWayMarketLegRef {
  ticker: string;
  price: number;
  name: string;
}

export interface ThreeWayMarkets {
  draw: ThreeWayMarketLegRef;
  teamLegs: [ThreeWayMarketLegRef, ThreeWayMarketLegRef];
}

/**
 * Fetches a three-way (soccer) Kalshi event and splits its exactly-three
 * markets into the draw leg and the two team legs. Unlike the shared
 * `fetchKalshiEventStage`, this never picks a single "priced market" — the
 * model needs all three legs' prices to decide which one (if any) to bet,
 * so nothing is chosen here. The draw leg is identified by its `-TIE`
 * ticker suffix, confirmed consistent across every audited soccer series
 * (KXEPLGAME, KXLALIGAGAME, KXMLSGAME, KXUCLGAME, ...).
 */
export async function fetchThreeWayKalshiEventStage(
  predictionId: string,
  ticker: string,
): Promise<{ response: KalshiEventResponse; markets: ThreeWayMarkets }> {
  const stageId = await startStage(predictionId, "fetch_kalshi_event");

  try {
    const response = await getKalshiEvent(ticker);
    const allMarkets = response.event?.markets ?? [];
    if (!response.event || allMarkets.length !== 3) {
      throw new InvalidThreeWayEventError(
        `Kalshi event ${ticker} does not have exactly three markets (found ${allMarkets.length}).`,
      );
    }

    const toLeg = (market: KalshiMarket): ThreeWayMarketLegRef => {
      const price = executableYesAskDollars(market);
      if (price == null) {
        throw new Error(`Kalshi market ${market.ticker} has no ask with size — nothing is for sale.`);
      }
      return { ticker: market.ticker, price, name: market.yes_sub_title ?? market.ticker };
    };

    const drawMarket = allMarkets.find((m) => m.ticker.endsWith("-TIE"));
    const teamMarkets = allMarkets.filter((m) => m !== drawMarket);
    if (!drawMarket || teamMarkets.length !== 2) {
      throw new InvalidThreeWayEventError(
        `Kalshi event ${ticker} has no recognizable draw leg (expected a "-TIE"-suffixed ticker among its three markets).`,
      );
    }

    const markets: ThreeWayMarkets = {
      draw: toLeg(drawMarket),
      teamLegs: [toLeg(teamMarkets[0]), toLeg(teamMarkets[1])],
    };

    await db
      .update(predictions)
      .set({ eventTitle: response.event.title, status: "running" })
      .where(eq(predictions.id, predictionId));

    await completeStage(stageId, "Three-way Kalshi event fetched.", {
      eventStatus: response.event.status,
      legs: [markets.draw.ticker, markets.teamLegs[0].ticker, markets.teamLegs[1].ticker],
    });

    return { response, markets };
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
