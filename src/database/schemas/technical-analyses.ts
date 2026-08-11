import { boolean, integer, jsonb, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { createdAt } from "./_helpers";
import { predictions } from "./predictions";

export const technicalAnalyses = pgTable("technical_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  predictionId: uuid("prediction_id")
    .references(() => predictions.id, { onDelete: "cascade" })
    .notNull(),

  team1Score: integer("team1_score").notNull(),
  team2Score: integer("team2_score").notNull(),
  gameProgress: numeric("game_progress", { precision: 6, scale: 4, mode: "number" }).notNull(),
  k: numeric("k", { precision: 8, scale: 4, mode: "number" }).notNull(),

  // Full snapshot of every input passed to f(S), for exact reproducibility.
  formulaInputs: jsonb("formula_inputs").$type<Record<string, unknown>>().notNull(),

  probability: numeric("probability", { precision: 6, scale: 5, mode: "number" }).notNull(),
  analysisVersion: varchar("analysis_version", { length: 32 }).notNull(),

  // Full ESPN feature tree (team strength, player availability, matchup, market),
  // added once `assemble_features` completes — null until then since it runs after
  // this row. Kept for reproducibility/debugging; structured columns below are the
  // fields actually consulted for the prediction.
  espnAnalytics: jsonb("espn_analytics").$type<Record<string, unknown>>(),

  // Structured summary of `espnAnalytics`, populated at the same time.
  team1OpponentAdjustedStrength: numeric("team1_opponent_adjusted_strength", { precision: 8, scale: 4, mode: "number" }),
  team2OpponentAdjustedStrength: numeric("team2_opponent_adjusted_strength", { precision: 8, scale: 4, mode: "number" }),
  team1AvailabilityRisk: boolean("team1_availability_risk"),
  team2AvailabilityRisk: boolean("team2_availability_risk"),
  team1LostProduction: numeric("team1_lost_production", { precision: 10, scale: 4, mode: "number" }),
  team2LostProduction: numeric("team2_lost_production", { precision: 10, scale: 4, mode: "number" }),
  compositeEdge: numeric("composite_edge", { precision: 8, scale: 4, mode: "number" }),
  marketSpread: numeric("market_spread", { precision: 8, scale: 2, mode: "number" }),
  marketTotal: numeric("market_total", { precision: 8, scale: 2, mode: "number" }),
  marketMoneylineHome: integer("market_moneyline_home"),
  marketMoneylineAway: integer("market_moneyline_away"),

  createdAt: createdAt(),
});

export const insertTechnicalAnalysisSchema = createInsertSchema(technicalAnalyses);
export const selectTechnicalAnalysisSchema = createSelectSchema(technicalAnalyses);
export type NewTechnicalAnalysis = typeof technicalAnalyses.$inferInsert;
export type TechnicalAnalysis = typeof technicalAnalyses.$inferSelect;
