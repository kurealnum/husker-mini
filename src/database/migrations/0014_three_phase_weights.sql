ALTER TABLE "prediction_configs" ADD COLUMN "espn_weight" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "prediction_configs" ADD COLUMN "combiner_weight" numeric(6, 4);--> statement-breakpoint
UPDATE "prediction_configs" SET "espn_weight" = "sentiment_weight", "combiner_weight" = 0.5;--> statement-breakpoint
ALTER TABLE "prediction_configs" ALTER COLUMN "espn_weight" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_configs" ALTER COLUMN "combiner_weight" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_configs" DROP COLUMN "sentiment_weight";--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "espn_win_probability" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "espn_model_version" varchar(32);--> statement-breakpoint
ALTER TABLE "model_outputs" ADD COLUMN "espn_probability" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "model_outputs" ADD COLUMN "espn_weight" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "model_outputs" ADD COLUMN "combiner_probability" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "model_outputs" ADD COLUMN "combiner_weight" numeric(5, 4);--> statement-breakpoint
UPDATE "model_outputs" SET "espn_probability" = "technical_probability", "espn_weight" = 0, "combiner_probability" = "final_probability", "combiner_weight" = 0;--> statement-breakpoint
ALTER TABLE "model_outputs" ALTER COLUMN "espn_probability" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "model_outputs" ALTER COLUMN "espn_weight" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "model_outputs" ALTER COLUMN "combiner_probability" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "model_outputs" ALTER COLUMN "combiner_weight" SET NOT NULL;
