DROP TABLE "sentiment_analyses" CASCADE;--> statement-breakpoint
ALTER TABLE "model_outputs" DROP COLUMN "sentiment_probability";--> statement-breakpoint
ALTER TABLE "model_outputs" DROP COLUMN "sentiment_weight";--> statement-breakpoint
ALTER TABLE "prediction_version_metadata" DROP COLUMN "sentiment_model_version";