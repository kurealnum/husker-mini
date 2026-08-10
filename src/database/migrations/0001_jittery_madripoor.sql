CREATE TABLE "technical_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_id" uuid NOT NULL,
	"team1_score" integer NOT NULL,
	"team2_score" integer NOT NULL,
	"game_progress" numeric(6, 4) NOT NULL,
	"k" numeric(8, 4) NOT NULL,
	"formula_inputs" jsonb NOT NULL,
	"probability" numeric(6, 5) NOT NULL,
	"analysis_version" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD CONSTRAINT "technical_analyses_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;