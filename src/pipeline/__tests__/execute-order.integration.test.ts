import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

process.env.KALSHI_API_BASE_URL = "https://mock-kalshi.test";

const { db, pool } = await import("@/lib/db");
const { predictions } = await import("@/database/schemas");
const { executeOrderStage, OrderNotFilledError } = await import("../execute-order");
type KalshiMarket = import("@/lib/kalshi/client").KalshiMarket;

const TICKER = "KXNFLGAME-EXEC-TEST";
const MARKET_TICKER = `${TICKER}-KC`;
const OPPOSITE_MARKET_TICKER = `${TICKER}-DEN`;

/**
 * A config version with trading mode "live" and its kill switch off — the
 * process-wide `LIVE_TRADING_ENABLED` env var each test sets is what
 * actually toggles paper vs. live in these tests, since
 * `resolveLiveTradingEnabled` requires all three gates open at once.
 */
const LIVE_CONFIG_VERSION = {
  id: 1,
  league: "nfl",
  tradingMode: "live",
  killSwitchEnabled: false,
} as import("@/database/schemas").PredictionConfigVersion;

async function insertPrediction(overrides: Partial<typeof predictions.$inferInsert>) {
  const [row] = await db
    .insert(predictions)
    .values({
      kalshiEventTicker: TICKER,
      kalshiMarketTicker: MARKET_TICKER,
      kalshiOppositeMarketTicker: OPPOSITE_MARKET_TICKER,
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
    const updated = await executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION);

    expect(updated.executionMode).toBe("paper");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never places a live order for a league whose config version is in paper mode, even with the process-wide flag on", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const paperConfigVersion = { ...LIVE_CONFIG_VERSION, tradingMode: "paper" } as typeof LIVE_CONFIG_VERSION;
    const prediction = await insertPrediction({});
    const updated = await executeOrderStage(prediction.id, prediction, paperConfigVersion);

    expect(updated.executionMode).toBe("paper");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never places a live order for a league whose kill switch is on, even in live trading mode", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const killedConfigVersion = { ...LIVE_CONFIG_VERSION, killSwitchEnabled: true } as typeof LIVE_CONFIG_VERSION;
    const prediction = await insertPrediction({});
    const updated = await executeOrderStage(prediction.id, prediction, killedConfigVersion);

    expect(updated.executionMode).toBe("paper");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing for a no_bet decision", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const prediction = await insertPrediction({ decision: "no_bet", predictedSide: null });
    const result = await executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION);

    expect(result.executionMode).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /** The book execute_order re-reads before pricing an order. */
  function book(overrides: { yes?: Partial<KalshiMarket>; no?: Partial<KalshiMarket> } = {}) {
    return {
      event: {
        event_ticker: TICKER,
        markets: [
          {
            ticker: MARKET_TICKER,
            status: "active",
            yes_ask_dollars: "0.6000",
            yes_ask_size_fp: "100.00",
            ...overrides.yes,
          },
          {
            ticker: OPPOSITE_MARKET_TICKER,
            status: "active",
            yes_ask_dollars: "0.4000",
            yes_ask_size_fp: "100.00",
            ...overrides.no,
          },
        ],
      },
    };
  }

  /**
   * Stubs the book and balance calls plus a create-order response, and returns
   * the captured order request bodies.
   */
  function stubOrder(
    orderResponse: Record<string, unknown>,
    bookResponse: unknown = book(),
  ) {
    const orderBodies: Record<string, unknown>[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        // Checked before the order path, which is also under "/events/".
        if (url.includes("/events/") && !url.includes("/portfolio/")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => bookResponse });
        }
        if (url.includes("/portfolio/balance")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ balance: 1_000_000 }),
          });
        }
        orderBodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ ok: true, status: 200, json: async () => orderResponse });
      }),
    );

    return orderBodies;
  }

  function stubFilledOrder(averageFillPrice: string) {
    return stubOrder({
      order_id: "order-123",
      client_order_id: "client-123",
      fill_count: "10.00",
      remaining_count: "0.00",
      average_fill_price: averageFillPrice,
    });
  }

  /**
   * An IOC order that crossed nothing. Both counts are zero because Kalshi
   * cancels the unfilled size before responding — the live API's actual shape.
   */
  function stubUnfilledOrder(orderId: string) {
    return stubOrder({
      order_id: orderId,
      client_order_id: "client-123",
      fill_count_fp: "0.00",
      remaining_count_fp: "0.00",
    });
  }

  it("places a live order, persists the order id before the fill, then records the real fill", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.PREDICTION_MIN_CONTRACTS = "1";
    process.env.PREDICTION_MAX_CONTRACTS = "1000";

    const orderBodies = stubFilledOrder("0.6000");

    const prediction = await insertPrediction({});
    const updated = await executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION);

    expect(updated.executionMode).toBe("live");
    expect(updated.entryPriceCents).toBe(60);
    expect(updated.predictedContracts).toBe(10);

    // A "yes" bet buys the YES leg of the market the price came from — never
    // the event ticker, which Kalshi 404s.
    expect(orderBodies).toHaveLength(1);
    expect(orderBodies[0]).toMatchObject({ ticker: MARKET_TICKER, side: "bid", price: "0.6000" });

    const [persisted] = await db.select().from(predictions).where(eq(predictions.id, prediction.id));
    expect(persisted.kalshiOrderId).toBe("order-123");
  });

  it("buys the opposite market's yes leg for a no bet instead of selling yes", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.PREDICTION_MIN_CONTRACTS = "1";
    process.env.PREDICTION_MAX_CONTRACTS = "1000";

    const orderBodies = stubFilledOrder("0.4000");

    // Market has yes at 0.60, so the no leg costs 0.40 — the yes price of the
    // sibling market.
    const prediction = await insertPrediction({
      decision: "buy_no",
      predictedSide: "no",
      modelProbability: 0.25,
    });
    const updated = await executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION);

    expect(updated.executionMode).toBe("live");
    expect(orderBodies).toHaveLength(1);
    expect(orderBodies[0]).toMatchObject({
      ticker: OPPOSITE_MARKET_TICKER,
      side: "bid",
      price: "0.4000",
    });
  });

  it("fails the stage and takes no position when the IOC order fills nothing", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.PREDICTION_MIN_CONTRACTS = "1";
    process.env.PREDICTION_MAX_CONTRACTS = "1000";

    stubUnfilledOrder("order-unfilled");

    const prediction = await insertPrediction({});
    await expect(executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION)).rejects.toThrow(OrderNotFilledError);

    // The order id is still recorded — the order exists, it just took no
    // position, and IOC means nothing is left resting on the exchange.
    const [persisted] = await db.select().from(predictions).where(eq(predictions.id, prediction.id));
    expect(persisted.kalshiOrderId).toBe("order-unfilled");
    expect(persisted.predictedContracts).toBeNull();
    expect(persisted.entryPriceCents).toBeNull();
  });

  it("re-runs into a fresh order after a zero-fill attempt instead of reusing the dead one", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.PREDICTION_MIN_CONTRACTS = "1";
    process.env.PREDICTION_MAX_CONTRACTS = "1000";

    const firstBodies = stubUnfilledOrder("order-dead");
    const prediction = await insertPrediction({});

    // First attempt: the IOC order fills nothing, so its id is persisted and
    // the stage fails.
    await expect(executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION)).rejects.toThrow(OrderNotFilledError);
    expect(firstBodies[0]?.client_order_id).toBe(`${prediction.id}:0`);

    const [afterFirst] = await db.select().from(predictions).where(eq(predictions.id, prediction.id));
    expect(afterFirst.kalshiOrderId).toBe("order-dead");

    // Second run resumes by order id, sees a canceled order with no fill, and
    // clears it rather than looking it up forever.
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          order: {
            order_id: "order-dead",
            status: "canceled",
            outcome_side: "yes",
            fill_count_fp: "0.00",
            remaining_count_fp: "10.00",
            initial_count_fp: "10.00",
            yes_price_dollars: "0.6000",
            no_price_dollars: "0.4000",
          },
        }),
      }),
    );

    await expect(executeOrderStage(prediction.id, afterFirst, LIVE_CONFIG_VERSION)).rejects.toThrow(/cleared it/);

    const [afterSecond] = await db.select().from(predictions).where(eq(predictions.id, prediction.id));
    expect(afterSecond.kalshiOrderId).toBeNull();

    // Third run submits again, under a new idempotency key — the same key would
    // be de-duped straight back to the dead order.
    vi.unstubAllGlobals();
    const thirdBodies = stubUnfilledOrder("order-dead-2");

    await expect(executeOrderStage(prediction.id, afterSecond, LIVE_CONFIG_VERSION)).rejects.toThrow(OrderNotFilledError);
    expect(thirdBodies[0]?.client_order_id).not.toBe(firstBodies[0]?.client_order_id);
    expect(String(thirdBodies[0]?.client_order_id)).toMatch(new RegExp(`^${prediction.id}:[1-9]`));
  });

  it("prices the order at the ask read back at execution time, not the scored price", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.PREDICTION_MIN_CONTRACTS = "1";
    process.env.PREDICTION_MAX_CONTRACTS = "1000";
    process.env.PREDICTION_MAX_SLIPPAGE_CENTS = "2";

    // Scored at 0.60, but the ask is 0.61 by the time the order goes in — one
    // cent of slippage, inside the budget.
    const orderBodies = stubOrder(
      {
        order_id: "order-ask",
        client_order_id: "client-123",
        fill_count_fp: "10.00",
        remaining_count_fp: "0.00",
        average_fill_price: "0.6100",
      },
      book({ yes: { yes_ask_dollars: "0.6100" } }),
    );

    const prediction = await insertPrediction({});
    const updated = await executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION);

    expect(orderBodies[0]).toMatchObject({ ticker: MARKET_TICKER, price: "0.6100" });
    expect(updated.entryPriceCents).toBe(61);
  });

  it("takes no position when the ask has moved past the slippage budget", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.PREDICTION_MAX_SLIPPAGE_CENTS = "2";

    // Scored at 0.60, ask now 0.70 — the edge the model found is gone.
    const orderBodies = stubOrder({}, book({ yes: { yes_ask_dollars: "0.7000" } }));

    const prediction = await insertPrediction({});
    const updated = await executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION);

    expect(orderBodies).toHaveLength(0);
    expect(updated.predictedContracts).toBe(0);
    expect(updated.executionMode).toBe("live");
  });

  it("takes no position when nothing is for sale on the leg it would buy", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";

    // An ask quote with no size behind it is a placeholder, not liquidity.
    const orderBodies = stubOrder({}, book({ yes: { yes_ask_size_fp: "0.00" } }));

    const prediction = await insertPrediction({});
    const updated = await executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION);

    expect(orderBodies).toHaveLength(0);
    expect(updated.predictedContracts).toBe(0);
  });

  it("takes no position when the opposite leg's ask is nowhere near the complementary price", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.PREDICTION_MAX_SLIPPAGE_CENTS = "2";

    // A "no" bet is scored at 100 - 60 = 40c, but the other leg's own book asks
    // 95c. The complement is an approximation, and on a wide spread it's fiction.
    const orderBodies = stubOrder({}, book({ no: { yes_ask_dollars: "0.9500" } }));

    const prediction = await insertPrediction({
      decision: "buy_no",
      predictedSide: "no",
      modelProbability: 0.25,
    });
    const updated = await executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION);

    expect(orderBodies).toHaveLength(0);
    expect(updated.predictedContracts).toBe(0);
  });

  it("fails a no bet without placing an order when no opposite market was recorded", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const prediction = await insertPrediction({
      decision: "buy_no",
      predictedSide: "no",
      modelProbability: 0.25,
      kalshiOppositeMarketTicker: null,
    });

    await expect(executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION)).rejects.toThrow(
      /no opposite market ticker/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails the stage and leaves no position when the order is rejected", async () => {
    process.env.LIVE_TRADING_ENABLED = "true";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/portfolio/balance")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ balance: 1_000_000 }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 400,
          text: async () => "insufficient contract count",
        });
      }),
    );

    const prediction = await insertPrediction({});
    await expect(executeOrderStage(prediction.id, prediction, LIVE_CONFIG_VERSION)).rejects.toThrow();

    const [persisted] = await db.select().from(predictions).where(eq(predictions.id, prediction.id));
    expect(persisted.predictedContracts).toBeNull();
    expect(persisted.entryPriceCents).toBeNull();
  });
});
