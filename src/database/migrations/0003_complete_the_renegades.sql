CREATE TABLE "model_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_id" uuid NOT NULL,
	"technical_probability" numeric(6, 5) NOT NULL,
	"sentiment_probability" numeric(6, 5) NOT NULL,
	"technical_weight" numeric(5, 4) NOT NULL,
	"sentiment_weight" numeric(5, 4) NOT NULL,
	"weight_version" varchar(32) NOT NULL,
	"final_probability" numeric(6, 5) NOT NULL,
	"claude_output" jsonb NOT NULL,
	"combiner_model_version" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_outputs" ADD CONSTRAINT "model_outputs_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;