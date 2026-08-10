CREATE TABLE "news_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_article_id" varchar(128) NOT NULL,
	"source" varchar(128) NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"published_at" timestamp with time zone NOT NULL,
	"filter_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "news_articles_source_provider_id_unique" ON "news_articles" USING btree ("source","provider_article_id");