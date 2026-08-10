CREATE TABLE "sentiment_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_id" uuid NOT NULL,
	"articles_considered" jsonb NOT NULL,
	"sentiment_scores" jsonb NOT NULL,
	"probability" numeric(6, 5) NOT NULL,
	"sentiment_model_version" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sentiment_analyses" ADD CONSTRAINT "sentiment_analyses_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;