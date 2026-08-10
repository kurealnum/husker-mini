import { jsonb, pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { createdAt, timestamptz } from "./_helpers";
import { predictions } from "./predictions";

/** Progress status of a single prediction pipeline stage. */
export const predictionStageStatusEnum = pgEnum("prediction_stage_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const predictionStages = pgTable("prediction_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  predictionId: uuid("prediction_id")
    .references(() => predictions.id, { onDelete: "cascade" })
    .notNull(),

  stage: varchar("stage", { length: 64 }).notNull(),
  status: predictionStageStatusEnum("status").notNull().default("pending"),
  message: text("message"),

  startedAt: timestamptz("started_at").notNull(),
  completedAt: timestamptz("completed_at"),

  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  createdAt: createdAt(),
});

export const insertPredictionStageSchema = createInsertSchema(predictionStages);
export const selectPredictionStageSchema = createSelectSchema(predictionStages);
export type NewPredictionStage = typeof predictionStages.$inferInsert;
export type PredictionStage = typeof predictionStages.$inferSelect;
