ALTER TABLE "predictions" ADD COLUMN IF NOT EXISTS "league" varchar(64);--> statement-breakpoint
ALTER TABLE "prediction_version_metadata" ADD COLUMN IF NOT EXISTS "win_probability_model_version" varchar(32);--> statement-breakpoint
UPDATE "predictions" SET "league" = "sport" WHERE "league" IS NULL AND "sport" IS NOT NULL;--> statement-breakpoint
UPDATE "predictions" SET "sport" = CASE
  WHEN "sport" IN ('nfl', 'ncaaf') THEN 'football'
  WHEN "sport" IN ('nba', 'ncaab') THEN 'basketball'
  WHEN "sport" = 'nhl' THEN 'hockey'
  WHEN "sport" = 'mlb' THEN 'baseball'
  ELSE "sport"
END
WHERE "sport" IN ('nfl', 'ncaaf', 'nba', 'ncaab', 'nhl', 'mlb');--> statement-breakpoint
UPDATE "prediction_version_metadata" SET "win_probability_model_version" = '1.0.0' WHERE "win_probability_model_version" IS NULL;--> statement-breakpoint
ALTER TABLE "prediction_version_metadata" ALTER COLUMN "win_probability_model_version" SET NOT NULL;
