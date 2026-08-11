CREATE TABLE "prediction_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"technical_k" numeric(8, 4) NOT NULL,
	"technical_weight" numeric(6, 4) NOT NULL,
	"sentiment_weight" numeric(6, 4) NOT NULL,
	"edge_threshold" numeric(6, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Seed version 1 with the values previously hardcoded as env vars, so
-- existing rows below and the app itself always have an active version.
INSERT INTO "prediction_configs" ("technical_k", "technical_weight", "sentiment_weight", "edge_threshold")
VALUES (1, 0.5, 0.5, 0.02);
--> statement-breakpoint
ALTER TABLE "prediction_version_metadata" ADD COLUMN "prediction_config_id" integer;--> statement-breakpoint
UPDATE "prediction_version_metadata" SET "prediction_config_id" = (SELECT MIN("id") FROM "prediction_configs");--> statement-breakpoint
ALTER TABLE "prediction_version_metadata" ALTER COLUMN "prediction_config_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_version_metadata" ADD CONSTRAINT "prediction_version_metadata_prediction_config_id_prediction_configs_id_fk" FOREIGN KEY ("prediction_config_id") REFERENCES "public"."prediction_configs"("id") ON DELETE restrict ON UPDATE no action;