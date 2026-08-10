import { integer, jsonb, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
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

  createdAt: createdAt(),
});

export const insertTechnicalAnalysisSchema = createInsertSchema(technicalAnalyses);
export const selectTechnicalAnalysisSchema = createSelectSchema(technicalAnalyses);
export type NewTechnicalAnalysis = typeof technicalAnalyses.$inferInsert;
export type TechnicalAnalysis = typeof technicalAnalyses.$inferSelect;
