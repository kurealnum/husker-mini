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

/** Outcome of a settled prediction relative to its decision. */
export const winLossEnum = pgEnum("win_loss", ["win", "loss"]);

export const predictions = pgTable("predictions", {
  id: uuid("id").primaryKey().defaultRandom(),

  kalshiEventTicker: varchar("kalshi_event_ticker", { length: 128 }).notNull(),
  // Populated once the prediction worker fetches the Kalshi event (stage 3.2).
  eventTitle: text("event_title"),
  sport: varchar("sport", { length: 64 }),

  status: predictionStatusEnum("status").notNull().default("pending"),

  // Probabilities are stored as numeric(0, 1); money is always integer cents.
  marketPrice: numeric("market_price", { precision: 6, scale: 5, mode: "number" }),
  modelProbability: numeric("model_probability", { precision: 6, scale: 5, mode: "number" }),
  rawEdge: numeric("raw_edge", { precision: 7, scale: 5, mode: "number" }),
  feesCents: integer("fees_cents"),
  netEdge: numeric("net_edge", { precision: 7, scale: 5, mode: "number" }),

  decision: predictionDecisionEnum("decision"),
  predictedSide: marketSideEnum("predicted_side"),
  predictedContracts: integer("predicted_contracts"),
  entryPriceCents: integer("entry_price_cents"),

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
