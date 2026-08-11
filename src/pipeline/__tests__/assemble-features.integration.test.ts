import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { db, pool } = await import("@/lib/db");
const { predictions, predictionStages } = await import("@/database/schemas");
const { assembleFeaturesStage } = await import("../assemble-features");

const TICKER = "KXNFLGAME-FEATURES-TEST";

function mockFetch(url: string) {
  if (url.includes("/teams/TEAM-1/schedule")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        events: [
          {
            competitions: [
              {
                status: { type: { completed: true } },
                competitors: [
                  { team: { id: "TEAM-1" }, score: "24", homeAway: "home" },
                  { team: { id: "TEAM-2" }, score: "17", homeAway: "away" },
                ],
              },
            ],
            date: "2026-08-01T00:00:00Z",
          },
        ],
      }),
    };
  }

  if (url.includes("/teams/TEAM-2/schedule")) {
    return { ok: true, status: 200, json: async () => ({ events: [] }) };
  }

  if (url.includes("/transactions")) {
    return { ok: true, status: 200, json: async () => ({ transactions: [] }) };
  }

  if (url.includes("/teams/TEAM-1/injuries") || url.includes("/teams/TEAM-2/injuries")) {
    return { ok: true, status: 200, json: async () => ({ items: [] }) };
  }

  if (url.includes("/teams/TEAM-1/roster") || url.includes("/teams/TEAM-2/roster")) {
    return { ok: true, status: 200, json: async () => ({ team: {}, athletes: [] }) };
  }

  if (url.includes("/odds")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            provider: { id: "1", name: "Mock Book" },
            details: "KC -3.5",
            overUnder: 45.5,
            spread: -3.5,
            homeTeamOdds: { moneyLine: -180 },
            awayTeamOdds: { moneyLine: 150 },
          },
        ],
      }),
    };
  }

  throw new Error(`Unexpected fetch to ${url} in assemble-features test.`);
}

describe("assembleFeaturesStage (integration)", () => {
  let predictionId: string;

  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => mockFetch(input.toString())),
    );

    const [inserted] = await db
      .insert(predictions)
      .values({ kalshiEventTicker: TICKER, status: "pending" })
      .returning({ id: predictions.id });
    predictionId = inserted.id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.delete(predictions).where(eq(predictions.kalshiEventTicker, TICKER));
    await pool.end();
  });

  it("assembles the full feature tree and persists it on the stage", async () => {
    const game = {
      team1: { id: "TEAM-1", name: "Team One", abbreviation: "T1", score: 24, isHome: true },
      team2: { id: "TEAM-2", name: "Team Two", abbreviation: "T2", score: 17, isHome: false },
      status: "final" as const,
      gameProgress: 1,
      gameDate: "2026-08-08T00:00:00Z",
      espnEventId: "EVENT-1",
    };

    const features = await assembleFeaturesStage(predictionId, "nfl", game);

    expect(features.team1.teamId).toBe("TEAM-1");
    expect(features.team2.teamId).toBe("TEAM-2");
    expect(features.team1.strength.winRate).toBe(1);
    expect(features.team1.context.homeAway).toBe("home");
    expect(features.team1.context.restDays).toBe(7);
    expect(features.matchup.compositeEdge).toBeGreaterThan(0);
    expect(features.market).toEqual({
      capturedAt: expect.any(String),
      moneylineHome: -180,
      moneylineAway: 150,
      spread: -3.5,
      total: 45.5,
    });

    const [stage] = await db
      .select()
      .from(predictionStages)
      .where(eq(predictionStages.predictionId, predictionId));
    expect(stage.status).toBe("completed");
    expect(stage.stage).toBe("assemble_features");
    expect(stage.metadata).toMatchObject({ team1: { teamId: "TEAM-1" } });
  });
});
