CREATE TABLE "prediction_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_id" uuid NOT NULL,
	"kalshi_market_data" jsonb NOT NULL,
	"sports_data" jsonb NOT NULL,
	"news_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_snapshots_prediction_id_unique" UNIQUE("prediction_id")
);
--> statement-breakpoint
ALTER TABLE "prediction_snapshots" ADD CONSTRAINT "prediction_snapshots_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;