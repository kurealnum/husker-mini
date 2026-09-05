import { afterEach, describe, expect, it, vi } from "vitest";

process.env.KALSHI_API_BASE_URL = "https://mock-kalshi.test/trade-api/v2";

const {
  KalshiApiError,
  KalshiMarketClosedError,
  KalshiMarketNotFoundError,
  KalshiOrderRejectedError,
  executableYesAskDollars,
  getOrder,
  placeOrder,
} = await import("../client");

const TICKER = "KXMLBGAME-26AUG131310CLEDET-CLE";

function stubOrderResponse(status: number, body: string) {
  const fetchSpy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

function order() {
  return placeOrder({ ticker: TICKER, count: 10, priceCents: 67, clientOrderId: "prediction-1" });
}

describe("executableYesAskDollars", () => {
  it("returns the ask when size stands behind it", () => {
    expect(
      executableYesAskDollars({
        ticker: TICKER,
        status: "active",
        yes_ask_dollars: "0.6700",
        yes_ask_size_fp: "25.00",
      }),
    ).toBe(0.67);
  });

  it("returns null for an ask quote with no size", () => {
    // The shape a dry book actually returns: ask 1.00 with nothing behind it.
    expect(
      executableYesAskDollars({
        ticker: TICKER,
        status: "active",
        yes_ask_dollars: "1.0000",
        yes_ask_size_fp: "0.00",
        yes_bid_dollars: "0.5000",
        yes_bid_size_fp: "6.00",
        last_price_dollars: "0.5200",
      }),
    ).toBeNull();
  });

  it("returns null when the market quotes no ask at all", () => {
    expect(executableYesAskDollars({ ticker: TICKER, status: "active" })).toBeNull();
  });

  it("never falls back to the bid or the last trade", () => {
    // Both are prices no buy can cross, so neither is a substitute for an ask.
    expect(
      executableYesAskDollars({
        ticker: TICKER,
        status: "active",
        yes_bid_dollars: "0.5000",
        yes_bid_size_fp: "6.00",
        last_price_dollars: "0.5200",
      }),
    ).toBeNull();
  });
});

describe("placeOrder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buys the yes leg of the given market ticker at a dollar-scale limit price", async () => {
    const fetchSpy = stubOrderResponse(
      200,
      JSON.stringify({
        order_id: "order-1",
        client_order_id: "prediction-1",
        fill_count: "10.00",
        remaining_count: "0.00",
        average_fill_price: "0.6700",
      }),
    );

    const result = await order();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://mock-kalshi.test/trade-api/v2/portfolio/events/orders");
    expect(JSON.parse(init.body)).toMatchObject({
      ticker: TICKER,
      side: "bid",
      count: "10.00",
      price: "0.6700",
      client_order_id: "prediction-1",
      time_in_force: "immediate_or_cancel",
    });
    expect(result).toMatchObject({ orderId: "order-1", status: "executed", filledCount: 10 });
    expect(result.averageFillPriceCents).toBe(67);
  });

  it("reports an unfilled IOC order as canceled when Kalshi zeroes the remaining count", async () => {
    // The live API's shape: `_fp` suffixes, and remaining_count 0 because IOC
    // already canceled the unfilled size. Reading the remainder as "nothing
    // left, so it must have filled" reports this as fully executed.
    stubOrderResponse(
      200,
      JSON.stringify({
        order_id: "order-4",
        client_order_id: "prediction-1",
        fill_count_fp: "0.00",
        remaining_count_fp: "0.00",
      }),
    );

    const result = await order();

    expect(result).toMatchObject({ status: "canceled", filledCount: 0 });
    expect(result.averageFillPriceCents).toBeNull();
  });

  it("fails loudly when the response carries no readable fill count", async () => {
    stubOrderResponse(200, JSON.stringify({ order_id: "order-5", client_order_id: "prediction-1" }));

    await expect(order()).rejects.toThrow(/no readable fill count/);
  });

  it("reports an unfilled IOC order as canceled, not resting", async () => {
    stubOrderResponse(
      200,
      JSON.stringify({
        order_id: "order-2",
        client_order_id: "prediction-1",
        fill_count: "0.00",
        remaining_count: "10.00",
      }),
    );

    const result = await order();

    expect(result).toMatchObject({ status: "canceled", filledCount: 0 });
    expect(result.averageFillPriceCents).toBeNull();
  });

  it("keeps the filled size of a partially filled IOC order", async () => {
    stubOrderResponse(
      200,
      JSON.stringify({
        order_id: "order-3",
        client_order_id: "prediction-1",
        fill_count: "4.00",
        remaining_count: "6.00",
        average_fill_price: "0.6600",
      }),
    );

    const result = await order();

    // The remainder is gone, so the order is canceled — but 4 contracts are
    // held and have to be recorded.
    expect(result).toMatchObject({ status: "canceled", filledCount: 4 });
    expect(result.averageFillPriceCents).toBe(66);
  });

  it("reports a 404 as a missing market, not a closed one, and keeps the response body", async () => {
    stubOrderResponse(404, "not found");

    await expect(order()).rejects.toThrow(KalshiMarketNotFoundError);
    await expect(order()).rejects.toThrow(/not found/);
  });

  it("reports a closed market as closed even when Kalshi returns it as a 404", async () => {
    stubOrderResponse(404, '{"error":{"message":"market is closed"}}');

    await expect(order()).rejects.toThrow(KalshiMarketClosedError);
  });

  it("reports a closed market on a non-404 status", async () => {
    stubOrderResponse(409, "market inactive");

    await expect(order()).rejects.toThrow(KalshiMarketClosedError);
  });

  it("reports a 400 as a rejected order", async () => {
    stubOrderResponse(400, "invalid count");

    await expect(order()).rejects.toThrow(KalshiOrderRejectedError);
  });

  it("reports any other status as a generic API error", async () => {
    stubOrderResponse(500, "internal error");

    await expect(order()).rejects.toThrow(KalshiApiError);
  });
});

describe("getOrder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the average fill price, not the limit price, for a partially filled order", async () => {
    // Limit price 60c, but only 57c was actually paid on average.
    stubOrderResponse(
      200,
      JSON.stringify({
        order: {
          order_id: "order-1",
          status: "executed",
          outcome_side: "yes",
          fill_count_fp: "5.00",
          remaining_count_fp: "5.00",
          initial_count_fp: "10.00",
          yes_price_dollars: "0.6000",
          no_price_dollars: "0.4000",
          average_fill_price: "0.5700",
        },
      }),
    );

    const result = await getOrder("order-1");

    expect(result.filledCount).toBe(5);
    expect(result.averageFillPriceCents).toBe(57);
  });

  it("derives the average fill price from the taker fill cost when no average is given", async () => {
    // 5 contracts filled for a total cost of $2.85 -> 57c average.
    stubOrderResponse(
      200,
      JSON.stringify({
        order: {
          order_id: "order-2",
          status: "executed",
          outcome_side: "yes",
          fill_count_fp: "5.00",
          remaining_count_fp: "5.00",
          initial_count_fp: "10.00",
          yes_price_dollars: "0.6000",
          no_price_dollars: "0.4000",
          taker_fill_cost_dollars: "2.8500",
        },
      }),
    );

    const result = await getOrder("order-2");

    expect(result.averageFillPriceCents).toBe(57);
  });

  it("returns null rather than substituting the limit price when no fill price is available", async () => {
    stubOrderResponse(
      200,
      JSON.stringify({
        order: {
          order_id: "order-3",
          status: "executed",
          outcome_side: "yes",
          fill_count_fp: "5.00",
          remaining_count_fp: "5.00",
          initial_count_fp: "10.00",
          yes_price_dollars: "0.6000",
          no_price_dollars: "0.4000",
        },
      }),
    );

    const result = await getOrder("order-3");

    expect(result.filledCount).toBe(5);
    expect(result.averageFillPriceCents).toBeNull();
  });

  it("returns null for an unfilled order regardless of any price field", async () => {
    stubOrderResponse(
      200,
      JSON.stringify({
        order: {
          order_id: "order-4",
          status: "canceled",
          outcome_side: "yes",
          fill_count_fp: "0.00",
          remaining_count_fp: "0.00",
          initial_count_fp: "10.00",
          yes_price_dollars: "0.6000",
          no_price_dollars: "0.4000",
        },
      }),
    );

    const result = await getOrder("order-4");

    expect(result.filledCount).toBe(0);
    expect(result.averageFillPriceCents).toBeNull();
  });
});
