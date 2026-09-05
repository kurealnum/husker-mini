import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { getAvailableBankrollCents } from "@/lib/bankroll";
import { getStaticPredictionConfig } from "@/lib/config/prediction-config";
import {
  executableYesAskDollars,
  getKalshiEvent,
  getOrder,
  placeOrder,
  type KalshiOrderSide,
  type PlaceOrderResult,
} from "@/lib/kalshi/client";
import { calculatePositionSize } from "@/lib/kelly";
import { calculateKalshiFeeCents } from "@/lib/market-edge";
import { ASSUMED_CONTRACTS, deriveAssumedEntryPriceCents } from "@/lib/settlement";
import { predictions, predictionStages } from "@/database/schemas";
import type { Prediction } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

/**
 * Raised when a live order takes no position. Orders are IOC, so this means
 * the limit price didn't cross and Kalshi canceled it — the failed prediction
 * leaves nothing open on the exchange.
 */
export class OrderNotFilledError extends Error {}

/**
 * Idempotency key for this attempt's order. Kalshi de-dupes on
 * `client_order_id`, which is what protects the window between submitting an
 * order and persisting its id: a crash in there is retried with the same key
 * and gets the existing order back instead of a second one.
 *
 * So the key has to stay stable across a crashed attempt but change once an
 * attempt has concluded — otherwise a retry after a canceled, zero-fill order
 * is de-duped straight back to that dead order and can never place a new one.
 * Concluded `execute_order` stage rows are exactly that counter: a crash
 * leaves its row stuck in `running`, so the count (and the key) don't move,
 * while completeStage/failStage take a row out of `running`.
 */
async function attemptOrderId(predictionId: string): Promise<string> {
  const [row] = await db
    .select({ concluded: count() })
    .from(predictionStages)
    .where(
      and(
        eq(predictionStages.predictionId, predictionId),
        eq(predictionStages.stage, "execute_order"),
        ne(predictionStages.status, "running"),
      ),
    );

  return `${predictionId}:${row?.concluded ?? 0}`;
}

/**
 * Records a live run that deliberately took no position. Not a failure: the
 * prediction keeps its probability and edge for tracking, and the pipeline
 * carries on to settlement with zero contracts.
 */
async function recordNoPosition(
  predictionId: string,
  stageId: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<Prediction> {
  const [updated] = await db
    .update(predictions)
    .set({ executionMode: "live", predictedContracts: 0 })
    .where(eq(predictions.id, predictionId))
    .returning();

  await completeStage(stageId, message, { mode: "live", contracts: 0, ...metadata });
  return updated;
}

/**
 * Executes (or, when live trading is disabled, records as paper) the trade
 * decision computed by `calculate_market_edge`. Runs after that stage for
 * every prediction, including `no_bet` ones, so the stage log always shows
 * which mode a prediction ran in.
 *
 * Idempotent against crash/retry: as soon as a live order is created, its
 * Kalshi order id is persisted on the prediction before the fill is
 * confirmed. A resumed call sees `kalshiOrderId` already set and looks the
 * order up instead of submitting a duplicate.
 */
export async function executeOrderStage(predictionId: string, prediction: Prediction) {
  const stageId = await startStage(predictionId, "execute_order");

  try {
    if (!prediction.decision || prediction.decision === "no_bet" || !prediction.predictedSide) {
      await completeStage(stageId, "No trade decision; nothing to execute.", { mode: "none" });
      return prediction;
    }

    const config = getStaticPredictionConfig();

    if (!config.liveTradingEnabled) {
      const assumedEntryPriceCents = deriveAssumedEntryPriceCents(prediction);
      const feesCents =
        assumedEntryPriceCents != null
          ? calculateKalshiFeeCents(assumedEntryPriceCents / 100, ASSUMED_CONTRACTS, prediction.sport)
          : null;

      const [updated] = await db
        .update(predictions)
        .set({ executionMode: "paper", ...(feesCents != null && { feesCents }) })
        .where(eq(predictions.id, predictionId))
        .returning();
      await completeStage(stageId, "Live trading disabled; recorded as a paper trade.", {
        mode: "paper",
      });
      return updated;
    }

    if (prediction.marketPrice == null || prediction.modelProbability == null) {
      throw new Error("Cannot execute order: missing market price or model probability.");
    }

    const side: KalshiOrderSide = prediction.predictedSide;
    // The price the model scored its edge against, on the leg actually being
    // bought: the priced market's own ask for a "yes" bet, the opposite leg's
    // own ask for a "no" bet. Never a complement of the other leg's price —
    // each leg has its own order book and its own spread. The slippage check
    // below compares against the execution-time ask for that same leg, so it
    // only ever measures "the book moved", not a spread that was never zero.
    if (side === "no" && prediction.oppositeMarketPrice == null) {
      throw new Error("Cannot execute order: no opposite market price recorded for a buy_no decision.");
    }
    const scoredPriceCents = Math.round((side === "yes" ? prediction.marketPrice : prediction.oppositeMarketPrice!) * 100);
    const winProbability = side === "yes" ? prediction.modelProbability : 1 - prediction.modelProbability;

    // Kalshi orders buy the YES leg of a *market* ticker. Buying NO on the
    // priced market is the same trade as buying YES on the event's other
    // market, so a "no" bet is routed there. Both tickers come from
    // fetch_kalshi_event. Only the submit path needs one — a resumed
    // prediction is looked up by order id, so it stays resumable even if it
    // predates these columns.
    const orderTicker =
      side === "yes" ? prediction.kalshiMarketTicker : prediction.kalshiOppositeMarketTicker;

    let result: PlaceOrderResult;
    // Replaced with the execution-time ask on the submit path below.
    let priceCents = scoredPriceCents;
    // Only known on the submit path; a resumed prediction just looks the order up.
    let requestedContracts: number | null = null;

    if (prediction.kalshiOrderId) {
      // Resuming after a crash/retry — look up the existing order instead of resubmitting.
      result = await getOrder(prediction.kalshiOrderId);

      // An order that took no position and can no longer fill is dead weight:
      // keeping its id on the row makes every later run look it up and fail
      // again, so the prediction can never place another order. Drop the id
      // and let the next run submit a fresh one. Only terminal states qualify
      // — a resting order (a legacy GTC one) might still fill.
      if (result.filledCount < 1 && (result.status === "canceled" || result.status === "executed")) {
        await db
          .update(predictions)
          .set({ kalshiOrderId: null })
          .where(eq(predictions.id, predictionId));

        throw new OrderNotFilledError(
          `Order ${result.orderId} took no position (status: ${result.status}); ` +
            `cleared it so the next run submits a new order.`,
        );
      }
    } else {
      // No fallback to the event ticker: Kalshi 404s those, which the client
      // then reports as a missing market rather than a closed one.
      if (!orderTicker) {
        throw new Error(
          `Cannot execute order: no ${side === "yes" ? "priced" : "opposite"} market ticker ` +
            `recorded for event ${prediction.kalshiEventTicker}.`,
        );
      }

      // The book is re-read here, against the leg actually being bought. The
      // price from fetch_kalshi_event is minutes old by now, and for a "no" bet
      // it came from the other leg entirely.
      const event = await getKalshiEvent(prediction.kalshiEventTicker);
      const market = event.event?.markets?.find((m) => m.ticker === orderTicker);
      const askDollars = market ? executableYesAskDollars(market) : null;

      if (askDollars == null) {
        return recordNoPosition(
          predictionId,
          stageId,
          "Nothing for sale on the market; no position taken.",
          { ticker: orderTicker },
        );
      }

      priceCents = Math.round(askDollars * 100);
      const slippageCents = priceCents - scoredPriceCents;

      if (slippageCents > config.maxSlippageCents) {
        return recordNoPosition(
          predictionId,
          stageId,
          `Ask moved ${slippageCents}c against the scored price (budget ` +
            `${config.maxSlippageCents}c); no position taken.`,
          { ticker: orderTicker, scoredPriceCents, askPriceCents: priceCents },
        );
      }

      const bankrollCents = await getAvailableBankrollCents();
      // Sized on the price actually being paid, not the one the model scored.
      const sizing = calculatePositionSize(
        winProbability,
        priceCents / 100,
        bankrollCents,
        config.kellyFraction,
        config.minContracts,
        config.maxContracts,
      );

      if (sizing.contracts < 1) {
        return recordNoPosition(
          predictionId,
          stageId,
          "Kelly sizing produced zero contracts; no position taken.",
          { ticker: orderTicker, askPriceCents: priceCents },
        );
      }

      requestedContracts = sizing.contracts;
      result = await placeOrder({
        ticker: orderTicker,
        count: sizing.contracts,
        priceCents,
        clientOrderId: await attemptOrderId(predictionId),
      });

      // Persist the order id immediately, before confirming the fill, so a
      // crash between here and completeStage resumes via getOrder above.
      await db
        .update(predictions)
        .set({ executionMode: "live", kalshiOrderId: result.orderId })
        .where(eq(predictions.id, predictionId));
    }

    if (result.filledCount < 1 || result.averageFillPriceCents == null) {
      throw new OrderNotFilledError(
        `Order ${result.orderId} took no position — filled ${result.filledCount} of ` +
          `${requestedContracts ?? "?"} contracts at limit ${priceCents}c ` +
          `on ${orderTicker} (status: ${result.status}).`,
      );
    }

    const feesCents = calculateKalshiFeeCents(
      result.averageFillPriceCents / 100,
      result.filledCount,
      prediction.sport,
    );

    const [updated] = await db
      .update(predictions)
      .set({
        predictedContracts: result.filledCount,
        entryPriceCents: result.averageFillPriceCents,
        feesCents,
      })
      .where(eq(predictions.id, predictionId))
      .returning();

    await completeStage(stageId, "Order filled.", {
      mode: "live",
      ticker: orderTicker,
      orderId: result.orderId,
      filledCount: result.filledCount,
      averageFillPriceCents: result.averageFillPriceCents,
    });

    return updated;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
