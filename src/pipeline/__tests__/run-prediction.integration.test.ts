import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mocked before importing anything that constructs an OpenAI client.
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          parse: vi.fn().mockResolvedValue({
            choices: [
              { message: { parsed: { probability: 0.62, reasoning: "Mocked combiner reasoning." } } },
            ],
          }),
        },
      };
    },
  };
});

// All external services are mocked below, so these values just need to be
// present and well-formed — never real credentials.
process.env.KALSHI_API_BASE_URL = "https://mock-kalshi.test";
process.env.SPORTS_PROVIDER = "espn";
process.env.SPORTS_PROVIDER_API_BASE_URL = "https://mock-espn.test";
process.env.OPENAI_API_KEY = "mock-openai-key";

const { db, pool } = await import("@/lib/db");
const {
  predictions,
  predictionConfigs,
  modelOutputs,
  predictionSnapshots,
  predictionStages,
  predictionVersionMetadata,
  technicalAnalyses,
} = await import("@/database/schemas");
const { runPrediction } = await import("../run-prediction");

const TICKER = "KXNFLGAME-TEST";

function mockFetch(url: string) {
  if (url.startsWith(process.env.KALSHI_API_BASE_URL!)) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        event: {
          event_ticker: TICKER,
          title: "Chiefs at Broncos",
          category: "Sports",
          status: "open",
          markets: [
            {
              ticker: `${TICKER}-KC`,
              status: "open",
              yes_ask_dollars: "0.6000",
              yes_ask_size_fp: "100.00",
              yes_sub_title: "Kansas City",
            },
            {
              ticker: `${TICKER}-DEN`,
              status: "open",
              yes_ask_dollars: "0.4000",
              yes_ask_size_fp: "100.00",
              yes_sub_title: "Denver",
            },
          ],
        },
      }),
    };
  }

  if (url.includes("/teams?limit=999")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        sports: [
          {
            leagues: [
              {
                teams: [
                  {
                    team: {
                      id: "KC-ID",
                      displayName: "Kansas City Chiefs",
                      abbreviation: "KC",
                      location: "Kansas City",
                    },
                  },
                  {
                    team: {
                      id: "DEN-ID",
                      displayName: "Denver Broncos",
                      abbreviation: "DEN",
                      location: "Denver",
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    };
  }

  if (url.includes("/scoreboard")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        events: [
          {
            competitions: [
              {
                id: "EVENT-1",
                date: "2026-08-10T00:00:00Z",
                competitors: [
                  {
                    id: "1",
                    homeAway: "home",
                    team: { id: "KC-ID", displayName: "Kansas City Chiefs", abbreviation: "KC" },
                    score: "21",
                  },
                  {
                    id: "2",
                    homeAway: "away",
                    team: { id: "DEN-ID", displayName: "Denver Broncos", abbreviation: "DEN" },
                    score: "14",
                  },
                ],
                status: { type: { completed: false, state: "in" }, period: 3, displayClock: "5:00" },
              },
            ],
          },
        ],
      }),
    };
  }

  if (url.includes("/schedule")) {
    return { ok: true, status: 200, json: async () => ({ events: [] }) };
  }

  if (url.includes("/transactions")) {
    return { ok: true, status: 200, json: async () => ({ transactions: [] }) };
  }

  if (url.includes("/injuries")) {
    return { ok: true, status: 200, json: async () => ({ items: [] }) };
  }

  if (url.includes("/roster")) {
    return { ok: true, status: 200, json: async () => ({ team: {}, athletes: [] }) };
  }

  if (url.includes("/odds")) {
    return { ok: true, status: 200, json: async () => ({ items: [] }) };
  }

  throw new Error(`Unexpected fetch to ${url} in integration test.`);
}

describe("runPrediction (integration)", () => {
  let predictionId: string;
  let configVersionId: number;

  beforeAll(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => mockFetch(input.toString())),
    );

    const [configVersion] = await db
      .insert(predictionConfigs)
      .values({
        technicalK: 1,
        technicalWeight: 0.5,
        espnWeight: 0.3,
        combinerWeight: 0.2,
        edgeThreshold: 0.01,
        combinerModel: "mock-combiner-model",
      })
      .returning();
    configVersionId = configVersion.id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.delete(predictions).where(eq(predictions.kalshiEventTicker, TICKER));
    await db.delete(predictionConfigs).where(eq(predictionConfigs.id, configVersionId));
    await pool.end();
  });

  beforeEach(async () => {
    const [inserted] = await db
      .insert(predictions)
      .values({ kalshiEventTicker: TICKER, status: "pending" })
      .returning({ id: predictions.id });
    predictionId = inserted.id;
  });

  it("persists every intermediate stage's data and completes the prediction", async () => {
    await runPrediction(predictionId);

    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(prediction.status).toBe("waiting_for_result");
    expect(prediction.eventTitle).toBe("Chiefs at Broncos");
    expect(prediction.sport).toBe("nfl");
    expect(prediction.marketPrice).toBeCloseTo(0.6);
    expect(prediction.modelProbability).not.toBeNull();
    expect(prediction.decision).not.toBeNull();

    const [technical] = await db
      .select()
      .from(technicalAnalyses)
      .where(eq(technicalAnalyses.predictionId, predictionId));
    expect(technical).toBeDefined();
    expect(technical.team1Score).toBe(21);
    expect(technical.team2Score).toBe(14);

    const [output] = await db.select().from(modelOutputs).where(eq(modelOutputs.predictionId, predictionId));
    expect(output).toBeDefined();
    // No sports schedule history is mocked, so the ESPN analysis phase falls
    // back to a 0.5 coin flip; the combiner is mocked to return 0.62.
    expect(output.espnProbability).toBeCloseTo(0.5);
    expect(output.combinerProbability).toBeCloseTo(0.62);
    const expectedFinal =
      (output.technicalWeight * technical.probability +
        output.espnWeight * output.espnProbability +
        output.combinerWeight * output.combinerProbability) /
      (output.technicalWeight + output.espnWeight + output.combinerWeight);
    expect(output.finalProbability).toBeCloseTo(expectedFinal);

    const [snapshot] = await db
      .select()
      .from(predictionSnapshots)
      .where(eq(predictionSnapshots.predictionId, predictionId));
    expect(snapshot).toBeDefined();

    const [versionMetadata] = await db
      .select()
      .from(predictionVersionMetadata)
      .where(eq(predictionVersionMetadata.predictionId, predictionId));
    expect(versionMetadata).toBeDefined();
    expect(versionMetadata.combinerVersion).toBe("mock-combiner-model");
    expect(versionMetadata.predictionConfigId).toBe(configVersionId);

    const stages = await db
      .select()
      .from(predictionStages)
      .where(eq(predictionStages.predictionId, predictionId));
    const stageNames = stages.map((s) => s.stage);
    for (const expectedStage of [
      "fetch_kalshi_event",
      "resolve_teams",
      "find_sports_game",
      "technical_analysis",
      "assemble_features",
      "combine_analyses",
      "calculate_model_probability",
      "calculate_market_edge",
      "complete_prediction",
    ]) {
      expect(stageNames).toContain(expectedStage);
    }
    expect(stages.every((s) => s.status === "completed")).toBe(true);
  });
});
