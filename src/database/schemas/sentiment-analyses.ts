import { jsonb, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { createdAt } from "./_helpers";
import { predictions } from "./predictions";

export const sentimentAnalyses = pgTable("sentiment_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  predictionId: uuid("prediction_id")
    .references(() => predictions.id, { onDelete: "cascade" })
    .notNull(),

  // References into news_articles (added in a later migration), kept as a
  // snapshot here so the set of considered articles is fixed at analysis time.
  articlesConsidered: jsonb("articles_considered").$type<string[]>().notNull(),

  // Raw sentiment model output per article, keyed by article id.
  sentimentScores: jsonb("sentiment_scores").$type<Record<string, unknown>>().notNull(),

  probability: numeric("probability", { precision: 6, scale: 5, mode: "number" }).notNull(),
  sentimentModelVersion: varchar("sentiment_model_version", { length: 64 }).notNull(),

  createdAt: createdAt(),
});

export const insertSentimentAnalysisSchema = createInsertSchema(sentimentAnalyses);
export const selectSentimentAnalysisSchema = createSelectSchema(sentimentAnalyses);
export type NewSentimentAnalysis = typeof sentimentAnalyses.$inferInsert;
export type SentimentAnalysis = typeof sentimentAnalyses.$inferSelect;
