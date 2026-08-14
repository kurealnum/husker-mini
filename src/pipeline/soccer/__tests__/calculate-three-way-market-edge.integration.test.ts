import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const { db, pool } = await import("@/lib/db");
const { predictions, predictionConfigs } = await import("@/database/schemas");
const { calculateThreeWayMarketEdgeStage } = await import("../calculate-three-way-market-edge");

const TICKER = "KXEPLGAME-EDGE-TEST";

async function insertPrediction() {
  const [row] = await db
    .insert(predictions)
    .values({ kalshiEventTicker: TICKER, status: "running", league: "eng.1", sport: "soccer" })
    .returning();
  return row;
}

async function insertConfigVersion(edgeThreshold: number) {
  const [row] = await db
    .insert(predictionConfigs)
    .values({
      league: "eng.1",
      technicalK: 1,
      technicalWeight: 0.4,
      espnWeight: 0.3,
      combinerWeight: 0.3,
      edgeThreshold,
      combinerModel: "test-model",
    })
    .returning();
  return row;
}

describe("calculateThreeWayMarketEdgeStage (integration)", () => {
  afterAll(async () => {
    await db.delete(predictions).where(eq(predictions.kalshiEventTicker, TICKER));
    await db.delete(predictionConfigs).where(eq(predictionConfigs.league, "eng.1"));
    await pool.end();
  });

  it("picks whichever leg has the best net edge, even when the three prices don't sum to 1", async () => {
    const prediction = await insertPrediction();
    const configVersion = await insertConfigVersion(0.01);

    // Prices sum to 1.08 (book overround) — not 1 — and the draw leg is the
    // clearest mispricing (model says 40%, market prices it at 25%).
    const updated = await calculateThreeWayMarketEdgeStage(
      prediction.id,
      [
        { outcome: "team1", ticker: `${TICKER}-HOME`, marketPrice: 0.5, modelProbability: 0.52 },
        { outcome: "team2", ticker: `${TICKER}-AWAY`, marketPrice: 0.33, modelProbability: 0.3 },
        { outcome: "draw", ticker: `${TICKER}-TIE`, marketPrice: 0.25, modelProbability: 0.4 },
      ],
      configVersion,
      "eng.1",
    );

    expect(updated.decision).toBe("buy_yes");
    expect(updated.predictedSide).toBe("yes");
    expect(updated.kalshiMarketTicker).toBe(`${TICKER}-TIE`);
    expect(updated.marketPrice).toBeCloseTo(0.25);
    expect(updated.modelProbability).toBeCloseTo(0.4);
    expect(updated.rawEdge).toBeCloseTo(0.15);
  });

  it("records no_bet when no leg's edge clears the threshold", async () => {
    const prediction = await insertPrediction();
    const configVersion = await insertConfigVersion(0.5);

    const updated = await calculateThreeWayMarketEdgeStage(
      prediction.id,
      [
        { outcome: "team1", ticker: `${TICKER}-HOME`, marketPrice: 0.5, modelProbability: 0.52 },
        { outcome: "team2", ticker: `${TICKER}-AWAY`, marketPrice: 0.3, modelProbability: 0.28 },
        { outcome: "draw", ticker: `${TICKER}-TIE`, marketPrice: 0.25, modelProbability: 0.24 },
      ],
      configVersion,
      "eng.1",
    );

    expect(updated.decision).toBe("no_bet");
    expect(updated.predictedSide).toBeNull();
  });
});
