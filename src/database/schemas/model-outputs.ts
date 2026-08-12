import { jsonb, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { createdAt } from "./_helpers";
import { predictions } from "./predictions";

export const modelOutputs = pgTable("model_outputs", {
  id: uuid("id").primaryKey().defaultRandom(),
  predictionId: uuid("prediction_id")
    .references(() => predictions.id, { onDelete: "cascade" })
    .notNull(),

  // Team scores/game-progress phase.
  technicalProbability: numeric("technical_probability", {
    precision: 6,
    scale: 5,
    mode: "number",
  }).notNull(),
  technicalWeight: numeric("technical_weight", { precision: 5, scale: 4, mode: "number" }).notNull(),
  weightVersion: varchar("weight_version", { length: 32 }).notNull(),

  // ESPN analysis phase.
  espnProbability: numeric("espn_probability", { precision: 6, scale: 5, mode: "number" }).notNull(),
  espnWeight: numeric("espn_weight", { precision: 5, scale: 4, mode: "number" }).notNull(),

  // LLM combiner phase.
  combinerProbability: numeric("combiner_probability", { precision: 6, scale: 5, mode: "number" }).notNull(),
  combinerWeight: numeric("combiner_weight", { precision: 5, scale: 4, mode: "number" }).notNull(),

  // Weighted blend of the three phase probabilities above.
  finalProbability: numeric("final_probability", { precision: 6, scale: 5, mode: "number" }).notNull(),

  // Raw structured output returned by the combiner model.
  claudeOutput: jsonb("claude_output").$type<Record<string, unknown>>().notNull(),
  combinerModelVersion: varchar("combiner_model_version", { length: 64 }).notNull(),

  createdAt: createdAt(),
});

export const insertModelOutputSchema = createInsertSchema(modelOutputs);
export const selectModelOutputSchema = createSelectSchema(modelOutputs);
export type NewModelOutput = typeof modelOutputs.$inferInsert;
export type ModelOutput = typeof modelOutputs.$inferSelect;
