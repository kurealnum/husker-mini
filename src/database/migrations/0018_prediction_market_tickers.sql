ALTER TABLE "predictions" ADD COLUMN IF NOT EXISTS "kalshi_market_ticker" varchar(128);--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN IF NOT EXISTS "kalshi_opposite_market_ticker" varchar(128);
