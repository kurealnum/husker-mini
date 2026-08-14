import { boolean, numeric, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { createdAt } from "./_helpers";

/** Whether a league's config version is allowed to place real orders. New leagues default to `paper`. */
export const tradingModeEnum = pgEnum("trading_mode", ["paper", "live"]);
export type TradingMode = (typeof tradingModeEnum.enumValues)[number];

/**
 * Versioned set of tunable prediction model parameters, scoped to one
 * league (`league`, a key from `src/lib/leagues/registry.ts`). Every edit
 * inserts a new row rather than updating in place — `id` (auto-increment)
 * is the version number, and every prediction records which version it was
 * generated with (see `predictionVersionMetadata.predictionConfigId`), so
 * older predictions stay reproducible even after the active config changes.
 * Editing one league's config never affects another's — each has its own
 * independent version history and "active" (highest id for that league) row.
 */
export const predictionConfigs = pgTable("prediction_configs", {
  id: serial("id").primaryKey(),

  league: varchar("league", { length: 64 }).notNull(),

  technicalK: numeric("technical_k", { precision: 8, scale: 4, mode: "number" }).notNull(),

  // Weights for the pipeline's three phases (team scores/game progress, ESPN
  // analysis, LLM combiner), used to blend their probabilities into the
  // final model probability. Not required to sum to 1 — the blend
  // normalizes by their sum.
  technicalWeight: numeric("technical_weight", { precision: 6, scale: 4, mode: "number" }).notNull(),
  espnWeight: numeric("espn_weight", { precision: 6, scale: 4, mode: "number" }).notNull(),
  combinerWeight: numeric("combiner_weight", { precision: 6, scale: 4, mode: "number" }).notNull(),

  edgeThreshold: numeric("edge_threshold", { precision: 6, scale: 4, mode: "number" }).notNull(),

  // Combiner subsection: OpenAI model id used for the LLM combiner phase.
  combinerModel: varchar("combiner_model", { length: 128 }).notNull(),

  // Trading mode/kill switch: the live-trading safety gate for this league.
  // `tradingMode` can only be set to "live" once a backtest result meeting
  // `backtestThreshold` has been recorded (see `canEnableLiveMode` in
  // src/lib/config/prediction-config.ts) — enforced at config-creation time,
  // not just documented here.
  tradingMode: tradingModeEnum("trading_mode").notNull().default("paper"),
  // Stops new predictions for this league without touching any other
  // league's config, independent of `tradingMode`.
  killSwitchEnabled: boolean("kill_switch_enabled").notNull().default(false),
  // Accuracy the backtest actually achieved, and the threshold it had to
  // clear at the time, both recorded so a later, stricter threshold can't
  // retroactively look like it was already met.
  backtestAccuracy: numeric("backtest_accuracy", { precision: 6, scale: 5, mode: "number" }),
  backtestThreshold: numeric("backtest_threshold", { precision: 6, scale: 5, mode: "number" }),
  backtestRecordedAt: timestamp("backtest_recorded_at", { withTimezone: true, mode: "date" }),
  backtestNotes: text("backtest_notes"),

  createdAt: createdAt(),
});

export const insertPredictionConfigSchema = createInsertSchema(predictionConfigs);
export const selectPredictionConfigSchema = createSelectSchema(predictionConfigs);
export type NewPredictionConfigVersion = typeof predictionConfigs.$inferInsert;
export type PredictionConfigVersion = typeof predictionConfigs.$inferSelect;
