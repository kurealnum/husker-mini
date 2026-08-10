CREATE TABLE "prediction_version_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_id" uuid NOT NULL,
	"prediction_engine_version" varchar(32) NOT NULL,
	"technical_model_version" varchar(32) NOT NULL,
	"sentiment_model_version" varchar(64) NOT NULL,
	"combiner_version" varchar(64) NOT NULL,
	"feature_set_version" varchar(32) NOT NULL,
	"model_parameters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_version_metadata_prediction_id_unique" UNIQUE("prediction_id")
);
--> statement-breakpoint
ALTER TABLE "prediction_version_metadata" ADD CONSTRAINT "prediction_version_metadata_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;