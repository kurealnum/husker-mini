import { jsonb, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { createdAt } from "./_helpers";
import { predictions } from "./predictions";

/**
 * Single canonical record of every version/parameter set involved in a
 * prediction, independent of the per-stage version fields already stored on
 * technical_analyses/model_outputs. Lets a prediction be
 * reproduced or audited without cross-referencing every stage table.
 */
export const predictionVersionMetadata = pgTable("prediction_version_metadata", {
  id: uuid("id").primaryKey().defaultRandom(),
  predictionId: uuid("prediction_id")
    .references(() => predictions.id, { onDelete: "cascade" })
    .notNull()
    .unique(),

  predictionEngineVersion: varchar("prediction_engine_version", { length: 32 }).notNull(),
  technicalModelVersion: varchar("technical_model_version", { length: 32 }).notNull(),
  combinerVersion: varchar("combiner_version", { length: 64 }).notNull(),
  featureSetVersion: varchar("feature_set_version", { length: 32 }).notNull(),

  // Snapshot of every configured model parameter used for this prediction
  // (e.g. technical k, weights, edge threshold).
  modelParameters: jsonb("model_parameters").$type<Record<string, unknown>>().notNull(),

  createdAt: createdAt(),
});

export const insertPredictionVersionMetadataSchema = createInsertSchema(predictionVersionMetadata);
export const selectPredictionVersionMetadataSchema = createSelectSchema(predictionVersionMetadata);
export type NewPredictionVersionMetadata = typeof predictionVersionMetadata.$inferInsert;
export type PredictionVersionMetadata = typeof predictionVersionMetadata.$inferSelect;
