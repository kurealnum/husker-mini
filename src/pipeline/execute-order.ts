import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getAvailableBankrollCents } from "@/lib/bankroll";
import { getStaticPredictionConfig } from "@/lib/config/prediction-config";
import {
  getOrder,
  placeOrder,
  type KalshiOrderSide,
  type PlaceOrderResult,
} from "@/lib/kalshi/client";
import { calculatePositionSize } from "@/lib/kelly";
import { predictions } from "@/database/schemas";
import type { Prediction } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

/** Raised when a live order never fills — resting at the limit price with no execution. */
export class OrderNotFilledError extends Error {}

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
      const [updated] = await db
        .update(predictions)
        .set({ executionMode: "paper" })
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
    const yesPriceCents = Math.round(prediction.marketPrice * 100);
    const priceCents = side === "yes" ? yesPriceCents : 100 - yesPriceCents;
    const winProbability = side === "yes" ? prediction.modelProbability : 1 - prediction.modelProbability;

    let result: PlaceOrderResult;

    if (prediction.kalshiOrderId) {
      // Resuming after a crash/retry — look up the existing order instead of resubmitting.
      result = await getOrder(prediction.kalshiOrderId);
    } else {
      const bankrollCents = await getAvailableBankrollCents();
      const sizing = calculatePositionSize(
        winProbability,
        priceCents / 100,
        bankrollCents,
        config.kellyFraction,
        config.minContracts,
        config.maxContracts,
      );

      if (sizing.contracts < 1) {
        await db
          .update(predictions)
          .set({ executionMode: "live", predictedContracts: 0 })
          .where(eq(predictions.id, predictionId));
        await completeStage(stageId, "Kelly sizing produced zero contracts; no position taken.", {
          mode: "live",
          contracts: 0,
        });
        return prediction;
      }

      result = await placeOrder({
        ticker: prediction.kalshiEventTicker,
        side,
        count: sizing.contracts,
        priceCents,
        clientOrderId: predictionId,
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
        `Order ${result.orderId} has not filled (status: ${result.status}).`,
      );
    }

    const [updated] = await db
      .update(predictions)
      .set({
        predictedContracts: result.filledCount,
        entryPriceCents: result.averageFillPriceCents,
      })
      .where(eq(predictions.id, predictionId))
      .returning();

    await completeStage(stageId, "Order filled.", {
      mode: "live",
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
