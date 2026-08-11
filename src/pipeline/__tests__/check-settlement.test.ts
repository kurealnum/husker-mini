import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.KALSHI_API_BASE_URL = "https://mock-kalshi.test";

const { db, pool } = await import("@/lib/db");
const { predictions } = await import("@/database/schemas");
const { checkSettlement, getSettledResult } = await import("../check-settlement");

const TICKER = "KXNFLGAME-SETTLE-TEST";

function mockKalshiResponse(marketResult: string | undefined) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      event: {
        event_ticker: TICKER,
        title: "Test event",
        status: "open",
        markets: [{ ticker: `${TICKER}-YES`, status: marketResult ? "finalized" : "open", result: marketResult }],
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
      })
      .returning({ id: predictions.id });
    predictionId = inserted.id;
  });

  it("leaves the prediction unchanged when the event has not finished", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockKalshiResponse(undefined)));

    await checkSettlement(predictionId, TICKER);

    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(prediction.status).toBe("waiting_for_result");
    expect(prediction.settledResult).toBeNull();
  });

  it("finalizes with a win when the market settles yes and the prediction bought yes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockKalshiResponse("yes")));

    await checkSettlement(predictionId, TICKER);

    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(prediction.status).toBe("finished");
    expect(prediction.settledResult).toBe("yes");
    expect(prediction.winLoss).toBe("win");
    expect(prediction.pnlCents).toBeGreaterThan(0);
  });

  it("finalizes with a loss when the market settles no and the prediction bought yes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockKalshiResponse("no")));

    await checkSettlement(predictionId, TICKER);

    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(prediction.status).toBe("finished");
    expect(prediction.settledResult).toBe("no");
    expect(prediction.winLoss).toBe("loss");
    expect(prediction.pnlCents).toBeLessThan(0);
  });

  it("is safe to retry after a settlement is already recorded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockKalshiResponse("yes")));

    await checkSettlement(predictionId, TICKER);
    const [firstPass] = await db.select().from(predictions).where(eq(predictions.id, predictionId));

    await checkSettlement(predictionId, TICKER);
    const [secondPass] = await db.select().from(predictions).where(eq(predictions.id, predictionId));

    expect(secondPass.status).toBe("finished");
    expect(secondPass.pnlCents).toBe(firstPass.pnlCents);
    expect(secondPass.finishedAt!.getTime()).toBeGreaterThanOrEqual(firstPass.finishedAt!.getTime());
  });
});
