CREATE TYPE "public"."market_side" AS ENUM('yes', 'no');--> statement-breakpoint
CREATE TYPE "public"."prediction_decision" AS ENUM('buy_yes', 'buy_no', 'no_bet');--> statement-breakpoint
CREATE TYPE "public"."prediction_status" AS ENUM('pending', 'running', 'predicted', 'waiting_for_result', 'finished', 'failed');--> statement-breakpoint
CREATE TYPE "public"."win_loss" AS ENUM('win', 'loss');--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kalshi_event_ticker" varchar(128) NOT NULL,
	"event_title" text NOT NULL,
	"sport" varchar(64) NOT NULL,
	"status" "prediction_status" DEFAULT 'pending' NOT NULL,
	"market_price" numeric(6, 5),
	"model_probability" numeric(6, 5),
	"raw_edge" numeric(7, 5),
	"fees_cents" integer,
	"net_edge" numeric(7, 5),
	"decision" "prediction_decision",
	"predicted_side" "market_side",
	"predicted_contracts" integer,
	"entry_price_cents" integer,
	"detected_result" "market_side",
	"settled_result" "market_side",
	"win_loss" "win_loss",
	"pnl_cents" integer,
	"return_percentage" numeric(9, 5),
	"error_message" text,
	"predicted_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
