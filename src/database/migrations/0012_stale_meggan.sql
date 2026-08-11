ALTER TABLE "technical_analyses" ADD COLUMN "team1_opponent_adjusted_strength" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "team2_opponent_adjusted_strength" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "team1_availability_risk" boolean;--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "team2_availability_risk" boolean;--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "team1_lost_production" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "team2_lost_production" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "composite_edge" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "market_spread" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "market_total" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "market_moneyline_home" integer;--> statement-breakpoint
ALTER TABLE "technical_analyses" ADD COLUMN "market_moneyline_away" integer;