import { jsonb, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { createdAt, timestamptz } from "./_helpers";

export const newsArticles = pgTable(
  "news_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    providerArticleId: varchar("provider_article_id", { length: 128 }).notNull(),
    source: varchar("source", { length: 128 }).notNull(),

    title: text("title").notNull(),
    body: text("body"),
    publishedAt: timestamptz("published_at").notNull(),

    // Records why the article was included or excluded (e.g. matched teams,
    // relevance score, exclusion reason).
    filterMetadata: jsonb("filter_metadata").$type<Record<string, unknown>>(),

    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("news_articles_source_provider_id_unique").on(t.source, t.providerArticleId)],
);

export const insertNewsArticleSchema = createInsertSchema(newsArticles);
export const selectNewsArticleSchema = createSelectSchema(newsArticles);
export type NewNewsArticle = typeof newsArticles.$inferInsert;
export type NewsArticle = typeof newsArticles.$inferSelect;
