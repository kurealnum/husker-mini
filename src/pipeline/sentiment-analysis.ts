import { db } from "@/lib/db";
import { getPredictionConfig } from "@/lib/config/prediction-config";
import { classifySentiment } from "@/lib/sentiment/roberta-client";
import { sentimentAnalyses, type NewsArticle } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

/** Converts label scores into a single -1 (negative) to 1 (positive) signal. */
function toSignedScore(scores: { label: string; score: number }[]): number {
  const positive = scores.find((s) => s.label === "positive")?.score ?? 0;
  const negative = scores.find((s) => s.label === "negative")?.score ?? 0;
  return positive - negative;
}

/**
 * Runs each considered article's title/body through the configured sentiment
 * model and averages the results into a single probability. With no articles,
 * sentiment carries no signal and defaults to a neutral 0.5.
 */
export async function sentimentAnalysisStage(predictionId: string, articles: NewsArticle[]) {
  const stageId = await startStage(predictionId, "sentiment_analysis");

  try {
    const { sentimentModel: modelId } = getPredictionConfig();
    const apiKey = process.env.HUGGING_FACE_API_KEY;
    if (!apiKey && process.env.STUB_EXTERNAL_CALLS !== "true") {
      throw new Error("HUGGING_FACE_API_KEY must be configured.");
    }

    const sentimentScores: Record<string, unknown> = {};
    let probability = 0.5;

    if (articles.length > 0) {
      const signedScores = await Promise.all(
        articles.map(async (article) => {
          const text = `${article.title} ${article.body ?? ""}`.slice(0, 512);
          const scores = await classifySentiment(text, modelId, apiKey ?? "");
          sentimentScores[article.id] = scores;
          return toSignedScore(scores);
        }),
      );

      const averageSigned = signedScores.reduce((sum, s) => sum + s, 0) / signedScores.length;
      probability = Math.min(1, Math.max(0, (averageSigned + 1) / 2));
    }

    const [analysis] = await db
      .insert(sentimentAnalyses)
      .values({
        predictionId,
        articlesConsidered: articles.map((a) => a.id),
        sentimentScores,
        probability,
        sentimentModelVersion: modelId,
      })
      .returning();

    await completeStage(stageId, "Sentiment analysis complete.", { probability, articleCount: articles.length });
    return analysis;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
