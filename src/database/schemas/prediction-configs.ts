import { numeric, pgTable, serial } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { createdAt } from "./_helpers";

/**
 * Versioned set of tunable prediction model parameters. Every edit inserts a
 * new row rather than updating in place — `id` (auto-increment) is the
 * version number, and every prediction records which version it was
 * generated with (see `predictionVersionMetadata.predictionConfigId`), so
 * older predictions stay reproducible even after the active config changes.
 */
export const predictionConfigs = pgTable("prediction_configs", {
  id: serial("id").primaryKey(),

  technicalK: numeric("technical_k", { precision: 8, scale: 4, mode: "number" }).notNull(),
  technicalWeight: numeric("technical_weight", { precision: 6, scale: 4, mode: "number" }).notNull(),
  sentimentWeight: numeric("sentiment_weight", { precision: 6, scale: 4, mode: "number" }).notNull(),
  edgeThreshold: numeric("edge_threshold", { precision: 6, scale: 4, mode: "number" }).notNull(),

  createdAt: createdAt(),
});

export const insertPredictionConfigSchema = createInsertSchema(predictionConfigs);
export const selectPredictionConfigSchema = createSelectSchema(predictionConfigs);
export type NewPredictionConfigVersion = typeof predictionConfigs.$inferInsert;
export type PredictionConfigVersion = typeof predictionConfigs.$inferSelect;
