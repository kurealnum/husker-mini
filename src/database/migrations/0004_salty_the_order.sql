CREATE TYPE "public"."prediction_stage_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "prediction_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_id" uuid NOT NULL,
	"stage" varchar(64) NOT NULL,
	"status" "prediction_stage_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prediction_stages" ADD CONSTRAINT "prediction_stages_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;