import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mocked before importing anything that constructs an Anthropic client.
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        parse: vi.fn().mockResolvedValue({
          parsed_output: { probability: 0.62, reasoning: "Mocked combiner reasoning." },
        }),
      };
    },
  };
});

// All external services are mocked below, so these values just need to be
// present and well-formed — never real credentials.
process.env.KALSHI_API_BASE_URL = "https://mock-kalshi.test";
process.env.SPORTS_PROVIDER = "espn";
process.env.SPORTS_PROVIDER_API_BASE_URL = "https://mock-espn.test";
process.env.NEWS_PROVIDER_API_BASE_URL = "https://mock-news.test";
process.env.NEWS_PROVIDER_API_KEY = "mock-news-key";
process.env.HUGGING_FACE_API_KEY = "mock-hf-key";
process.env.PREDICTION_SENTIMENT_MODEL = "mock/sentiment-model";
process.env.ANTHROPIC_API_KEY = "mock-anthropic-key";
process.env.CLAUDE_COMBINER_MODEL = "mock-combiner-model";
process.env.PREDICTION_TECHNICAL_K = "1";
process.env.PREDICTION_TECHNICAL_WEIGHT = "0.5";
process.env.PREDICTION_SENTIMENT_WEIGHT = "0.5";
process.env.PREDICTION_EDGE_THRESHOLD = "0.01";

const { db, pool } = await import("@/lib/db");
const { predictions, modelOutputs, predictionSnapshots, predictionStages, predictionVersionMetadata, sentimentAnalyses, technicalAnalyses } =
  await import("@/database/schemas");
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
            { ticker: `${TICKER}-KC`, status: "open", yes_ask: 60, yes_sub_title: "Kansas City" },
            { ticker: `${TICKER}-DEN`, status: "open", yes_ask: 40, yes_sub_title: "Denver" },
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
                  { team: { displayName: "Kansas City Chiefs", abbreviation: "KC", location: "Kansas City" } },
                  { team: { displayName: "Denver Broncos", abbreviation: "DEN", location: "Denver" } },
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
                competitors: [
                  { team: { displayName: "Kansas City Chiefs", abbreviation: "KC" }, score: "21" },
                  { team: { displayName: "Denver Broncos", abbreviation: "DEN" }, score: "14" },
                ],
                status: { type: { completed: false, state: "in" }, period: 3, displayClock: "5:00" },
              },
            ],
          },
        ],
      }),
    };
  }

  if (url.startsWith(process.env.NEWS_PROVIDER_API_BASE_URL!)) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: "ok",
        articles: [
          {
            url: "https://news.test/article-1",
            title: "Chiefs dominate Broncos in third quarter",
            description: "The Kansas City Chiefs pulled ahead of the Denver Broncos.",
            content: null,
            publishedAt: new Date().toISOString(),
            source: { name: "Mock News" },
          },
        ],
      }),
    };
  }

  if (url.includes("api-inference.huggingface.co")) {
    return {
      ok: true,
      status: 200,
      json: async () => [
        [
          { label: "positive", score: 0.8 },
          { label: "neutral", score: 0.15 },
          { label: "negative", score: 0.05 },
        ],
      ],
    };
  }

  throw new Error(`Unexpected fetch to ${url} in integration test.`);
}

describe("runPrediction (integration)", () => {
  let predictionId: string;

  beforeAll(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => mockFetch(input.toString())),
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.delete(predictions).where(eq(predictions.kalshiEventTicker, TICKER));
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

    const [sentiment] = await db
      .select()
      .from(sentimentAnalyses)
      .where(eq(sentimentAnalyses.predictionId, predictionId));
    expect(sentiment).toBeDefined();
    expect(sentiment.articlesConsidered.length).toBe(1);

    const [output] = await db.select().from(modelOutputs).where(eq(modelOutputs.predictionId, predictionId));
    expect(output).toBeDefined();
    expect(output.finalProbability).toBeCloseTo((technical.probability + sentiment.probability) / 2);

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
      "fetch_news",
      "sentiment_analysis",
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
