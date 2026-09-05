import { integer, numeric, pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { timestamps, timestamptz } from "./_helpers";

/** Lifecycle of a prediction, from creation through settlement. */
export const predictionStatusEnum = pgEnum("prediction_status", [
  "pending",
  "running",
  "predicted",
  "waiting_for_result",
  "finished",
  "failed",
]);

/** Trade decision produced by the prediction pipeline. */
export const predictionDecisionEnum = pgEnum("prediction_decision", [
  "buy_yes",
  "buy_no",
  "no_bet",
]);

/** Kalshi market side, used for predicted side, detected result, and settled result. */
export const marketSideEnum = pgEnum("market_side", ["yes", "no"]);
export type MarketSide = (typeof marketSideEnum.enumValues)[number];

/** Outcome of a settled prediction relative to its decision. */
export const winLossEnum = pgEnum("win_loss", ["win", "loss"]);

/** Whether a prediction's order execution was a real Kalshi order or a paper-trade no-op. */
export const executionModeEnum = pgEnum("execution_mode", ["live", "paper"]);

export const predictions = pgTable("predictions", {
  id: uuid("id").primaryKey().defaultRandom(),

  kalshiEventTicker: varchar("kalshi_event_ticker", { length: 128 }).notNull(),
  // Populated once the prediction worker fetches the Kalshi event (stage 3.2).
  eventTitle: text("event_title"),
  // Orders take a market ticker (the per-team leg, e.g. "…-CLE"), not the
  // event ticker. `kalshiMarketTicker` is the leg `marketPrice` was read from;
  // `kalshiOppositeMarketTicker` is its sibling, where a "no" bet is placed as
  // a "yes" buy. Both are recorded so execute_order never has to re-derive them.
  kalshiMarketTicker: varchar("kalshi_market_ticker", { length: 128 }),
  kalshiOppositeMarketTicker: varchar("kalshi_opposite_market_ticker", { length: 128 }),
  sport: varchar("sport", { length: 64 }),

  status: predictionStatusEnum("status").notNull().default("pending"),

  // Probabilities are stored as numeric(0, 1); money is always integer cents.
  marketPrice: numeric("market_price", { precision: 6, scale: 5, mode: "number" }),
  // The opposite leg's own executable YES ask — what a "no" bet actually pays,
  // since it's bought as a YES fill on that leg's book. Never `100 - marketPrice`:
  // the two legs have separate order books and separate spreads.
  oppositeMarketPrice: numeric("opposite_market_price", { precision: 6, scale: 5, mode: "number" }),
  modelProbability: numeric("model_probability", { precision: 6, scale: 5, mode: "number" }),
  rawEdge: numeric("raw_edge", { precision: 7, scale: 5, mode: "number" }),
  feesCents: integer("fees_cents"),
  netEdge: numeric("net_edge", { precision: 7, scale: 5, mode: "number" }),

  decision: predictionDecisionEnum("decision"),
  predictedSide: marketSideEnum("predicted_side"),
  predictedContracts: integer("predicted_contracts"),
  entryPriceCents: integer("entry_price_cents"),
  // Real Kalshi order id, recorded as soon as the order is created (before the
  // fill is confirmed) so a resumed/retried execute_order stage can look up
  // an in-flight order instead of submitting a duplicate.
  kalshiOrderId: varchar("kalshi_order_id", { length: 128 }),
  executionMode: executionModeEnum("execution_mode"),

  detectedResult: marketSideEnum("detected_result"),
  settledResult: marketSideEnum("settled_result"),
  winLoss: winLossEnum("win_loss"),
  pnlCents: integer("pnl_cents"),
  returnPercentage: numeric("return_percentage", { precision: 9, scale: 5, mode: "number" }),

  errorMessage: text("error_message"),

  predictedAt: timestamptz("predicted_at"),
  finishedAt: timestamptz("finished_at"),
  ...timestamps,
});

export const insertPredictionSchema = createInsertSchema(predictions);
export const selectPredictionSchema = createSelectSchema(predictions);
export type NewPrediction = typeof predictions.$inferInsert;
export type Prediction = typeof predictions.$inferSelect;
