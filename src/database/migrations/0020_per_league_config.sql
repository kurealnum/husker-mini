DO $$ BEGIN
  CREATE TYPE "trading_mode" AS ENUM ('paper', 'live');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "prediction_configs" ADD COLUMN IF NOT EXISTS "league" varchar(64);--> statement-breakpoint
ALTER TABLE "prediction_configs" ADD COLUMN IF NOT EXISTS "trading_mode" "trading_mode" NOT NULL DEFAULT 'paper';--> statement-breakpoint
ALTER TABLE "prediction_configs" ADD COLUMN IF NOT EXISTS "kill_switch_enabled" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "prediction_configs" ADD COLUMN IF NOT EXISTS "backtest_accuracy" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "prediction_configs" ADD COLUMN IF NOT EXISTS "backtest_threshold" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "prediction_configs" ADD COLUMN IF NOT EXISTS "backtest_recorded_at" timestamptz;--> statement-breakpoint
ALTER TABLE "prediction_configs" ADD COLUMN IF NOT EXISTS "backtest_notes" text;--> statement-breakpoint

-- Config was previously global. Tag existing rows as "mlb" (the first
-- league this app supported) so existing predictions' recorded config
-- version keeps its original values under a league label, then clone that
-- history to the other five leagues that were already running so each gets
-- its own independent version history from day one, seeded identically.
UPDATE "prediction_configs" SET "league" = 'mlb' WHERE "league" IS NULL;--> statement-breakpoint

INSERT INTO "prediction_configs" (
  league, technical_k, technical_weight, espn_weight, combiner_weight,
  edge_threshold, combiner_model, trading_mode, kill_switch_enabled,
  backtest_accuracy, backtest_threshold, backtest_recorded_at, backtest_notes, created_at
)
SELECT
  leagues.league, pc.technical_k, pc.technical_weight, pc.espn_weight, pc.combiner_weight,
  pc.edge_threshold, pc.combiner_model, pc.trading_mode, pc.kill_switch_enabled,
  pc.backtest_accuracy, pc.backtest_threshold, pc.backtest_recorded_at, pc.backtest_notes, pc.created_at
FROM "prediction_configs" pc
CROSS JOIN (VALUES ('nfl'), ('ncaaf'), ('nba'), ('ncaab'), ('nhl')) AS leagues(league)
WHERE pc.league = 'mlb';--> statement-breakpoint

ALTER TABLE "prediction_configs" ALTER COLUMN "league" SET NOT NULL;
