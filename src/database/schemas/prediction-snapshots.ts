import { jsonb, pgTable, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { createdAt } from "./_helpers";
import { predictions } from "./predictions";

/**
 * Raw external API payloads captured at prediction time, kept independent of
 * `news_articles`/`technical_analyses` so historical predictions stay
 * reproducible even if those APIs or our parsing of them change later.
 */
export const predictionSnapshots = pgTable("prediction_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  predictionId: uuid("prediction_id")
    .references(() => predictions.id, { onDelete: "cascade" })
    .notNull()
    .unique(),

  kalshiMarketData: jsonb("kalshi_market_data").$type<Record<string, unknown>>().notNull(),
  sportsData: jsonb("sports_data").$type<Record<string, unknown>>().notNull(),
  newsData: jsonb("news_data").$type<Record<string, unknown>>().notNull(),

  createdAt: createdAt(),
});

export const insertPredictionSnapshotSchema = createInsertSchema(predictionSnapshots);
export const selectPredictionSnapshotSchema = createSelectSchema(predictionSnapshots);
export type NewPredictionSnapshot = typeof predictionSnapshots.$inferInsert;
export type PredictionSnapshot = typeof predictionSnapshots.$inferSelect;
