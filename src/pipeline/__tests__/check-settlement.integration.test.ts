import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.KALSHI_API_BASE_URL = "https://mock-kalshi.test";

const { db, pool } = await import("@/lib/db");
const { predictions } = await import("@/database/schemas");
const { checkSettlement, getSettledResult } = await import("../check-settlement");

const TICKER = "KXNFLGAME-SETTLE-TEST";
const PRICED_MARKET_TICKER = `${TICKER}-YES`;
const OTHER_MARKET_TICKER = `${TICKER}-NO`;

function mockKalshiResponse(marketResult: string | undefined, opts?: { reversed?: boolean }) {
  const pricedMarket = { ticker: PRICED_MARKET_TICKER, status: marketResult ? "finalized" : "open", result: marketResult };
  // The opposite leg settles to the other side; used to prove settlement
  // reads by ticker rather than by array position.
  const otherResult = marketResult === "yes" ? "no" : marketResult === "no" ? "yes" : undefined;
  const otherMarket = { ticker: OTHER_MARKET_TICKER, status: marketResult ? "finalized" : "open", result: otherResult };
  const markets = opts?.reversed ? [otherMarket, pricedMarket] : [pricedMarket, otherMarket];

  return {
    ok: true,
    status: 200,
    json: async () => ({
      event: {
        event_ticker: TICKER,
        title: "Test event",
        status: "open",
        markets,
      },
    }),
  };
}

describe("getSettledResult", () => {
  it("returns null for an unfinished event (no result yet)", () => {
    expect(getSettledResult(undefined)).toBeNull();
    expect(getSettledResult("")).toBeNull();
  });

  it("returns yes/no for a finished event", () => {
    expect(getSettledResult("yes")).toBe("yes");
    expect(getSettledResult("no")).toBe("no");
  });
});

describe("checkSettlement (integration)", () => {
  let predictionId: string;

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.delete(predictions).where(eq(predictions.kalshiEventTicker, TICKER));
    await pool.end();
  });

  beforeEach(async () => {
    const [inserted] = await db
      .insert(predictions)
      .values({
        kalshiEventTicker: TICKER,
        status: "waiting_for_result",
        decision: "buy_yes",
        predictedSide: "yes",
        marketPrice: 0.6,
        feesCents: 3,
        kalshiMarketTicker: PRICED_MARKET_TICKER,
      })
      .returning({ id: predictions.id });
    predictionId = inserted.id;
  });

  it("leaves the prediction unchanged when the event has not finished", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockKalshiResponse(undefined)));

    await checkSettlement(predictionId, TICKER, PRICED_MARKET_TICKER);

    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(prediction.status).toBe("waiting_for_result");
    expect(prediction.settledResult).toBeNull();
  });

  it("finalizes with a win when the market settles yes and the prediction bought yes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockKalshiResponse("yes")));

    await checkSettlement(predictionId, TICKER, PRICED_MARKET_TICKER);

    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(prediction.status).toBe("finished");
    expect(prediction.settledResult).toBe("yes");
    expect(prediction.winLoss).toBe("win");
    expect(prediction.pnlCents).toBeGreaterThan(0);
  });

  it("finalizes with a loss when the market settles no and the prediction bought yes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockKalshiResponse("no")));

    await checkSettlement(predictionId, TICKER, PRICED_MARKET_TICKER);

    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(prediction.status).toBe("finished");
    expect(prediction.settledResult).toBe("no");
    expect(prediction.winLoss).toBe("loss");
    expect(prediction.pnlCents).toBeLessThan(0);
  });

  it("is safe to retry after a settlement is already recorded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockKalshiResponse("yes")));

    await checkSettlement(predictionId, TICKER, PRICED_MARKET_TICKER);
    const [firstPass] = await db.select().from(predictions).where(eq(predictions.id, predictionId));

    await checkSettlement(predictionId, TICKER, PRICED_MARKET_TICKER);
    const [secondPass] = await db.select().from(predictions).where(eq(predictions.id, predictionId));

    expect(secondPass.status).toBe("finished");
    expect(secondPass.pnlCents).toBe(firstPass.pnlCents);
    expect(secondPass.finishedAt!.getTime()).toBeGreaterThanOrEqual(firstPass.finishedAt!.getTime());
  });

  it("settles against the stored ticker even when Kalshi returns markets in reverse order", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockKalshiResponse("yes", { reversed: true })));

    await checkSettlement(predictionId, TICKER, PRICED_MARKET_TICKER);

    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(prediction.status).toBe("finished");
    // markets[0] would be the opposite leg here, which settled "no" — the
    // stored ticker's own result ("yes") must be what's used.
    expect(prediction.settledResult).toBe("yes");
    expect(prediction.winLoss).toBe("win");
  });

  it("leaves the prediction waiting when the stored ticker is missing from the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          event: {
            event_ticker: TICKER,
            title: "Test event",
            status: "open",
            markets: [{ ticker: "SOME-OTHER-MARKET", status: "finalized", result: "yes" }],
          },
        }),
      })),
    );

    await checkSettlement(predictionId, TICKER, PRICED_MARKET_TICKER);

    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(prediction.status).toBe("waiting_for_result");
    expect(prediction.settledResult).toBeNull();
  });
});
