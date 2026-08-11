CREATE TYPE "public"."execution_mode" AS ENUM('live', 'paper');--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "kalshi_order_id" varchar(128);--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "execution_mode" "execution_mode";