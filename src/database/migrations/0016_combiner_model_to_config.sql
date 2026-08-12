ALTER TABLE "prediction_configs" ADD COLUMN "combiner_model" varchar(128);--> statement-breakpoint
UPDATE "prediction_configs" SET "combiner_model" = 'claude-sonnet-5';--> statement-breakpoint
ALTER TABLE "prediction_configs" ALTER COLUMN "combiner_model" SET NOT NULL;
