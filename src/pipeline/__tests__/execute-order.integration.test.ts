import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

process.env.KALSHI_API_BASE_URL = "https://mock-kalshi.test";

const { db, pool } = await import("@/lib/db");
const { predictions } = await import("@/database/schemas");
const { executeOrderStage } = await import("../execute-order");

const TICKER = "KXNFLGAME-EXEC-TEST";

async function insertPrediction(overrides: Partial<typeof predictions.$inferInsert>) {
  const [row] = await db
    .insert(predictions)
    .values({
      kalshiEventTicker: TICKER,
      status: "running",
      decision: "buy_yes",
      predictedSide: "yes",
      marketPrice: 0.6,
      modelProbability: 0.75,
      feesCents: 3,
      ...overrides,
    })
    .returning();
  return row;
}

describe("executeOrderStage", () => {
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.LIVE_TRADING_ENABLED;
    await db.delete(predictions).where(eq(predictions.kalshiEventTicker, TICKER));
    await pool.end();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records a paper trade and skips order placement when live trading is disabled", async () => {
    delete process.env.LIVE_TRADING_ENABLED;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const prediction = await insertPrediction({});
    const updated = await executeOrderStage(prediction.id, prediction);

    expect(updated.executionMode).toBe("paper");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing for a no_bet decision", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const prediction = await insertPrediction({ decision: "no_bet", predictedSide: null });
    const result = await executeOrderStage(prediction.id, prediction);

    expect(result.executionMode).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("places a live order, persists the order id before the fill, then records the real fill", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.PREDICTION_STARTING_BANKROLL_CENTS = "1000000";
    process.env.PREDICTION_MIN_CONTRACTS = "1";
    process.env.PREDICTION_MAX_CONTRACTS = "1000";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          order: {
            order_id: "order-123",
            status: "executed",
            ticker: TICKER,
            side: "yes",
            yes_price: 60,
            count: 10,
            taker_fill_count: 10,
            remaining_count: 0,
          },
        }),
      }),
    );

    const prediction = await insertPrediction({});
    const updated = await executeOrderStage(prediction.id, prediction);

    expect(updated.executionMode).toBe("live");
    expect(updated.entryPriceCents).toBe(60);
    expect(updated.predictedContracts).toBe(10);

    const [persisted] = await db.select().from(predictions).where(eq(predictions.id, prediction.id));
    expect(persisted.kalshiOrderId).toBe("order-123");
  });

  it("fails the stage and leaves no position when the order is rejected", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "insufficient contract count",
      }),
    );

    const prediction = await insertPrediction({});
    await expect(executeOrderStage(prediction.id, prediction)).rejects.toThrow();

    const [persisted] = await db.select().from(predictions).where(eq(predictions.id, prediction.id));
    expect(persisted.predictedContracts).toBeNull();
    expect(persisted.entryPriceCents).toBeNull();
  });
});
