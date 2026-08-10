import { db } from "@/lib/db";
import { getNewsProvider, type NewsArticleCandidate } from "@/lib/news";
import { newsArticles } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

const RELEVANCE_WINDOW_DAYS = 3;

function isRelevant(article: NewsArticleCandidate, team1: string, team2: string): boolean {
  const ageMs = Date.now() - article.publishedAt.getTime();
  if (ageMs > RELEVANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000) return false;
  if (!article.title || !article.body) return false;

  const haystack = `${article.title} ${article.body}`.toLowerCase();
  return haystack.includes(team1.toLowerCase()) || haystack.includes(team2.toLowerCase());
}

/**
 * Searches the configured news provider for articles about either team,
 * filters to recent/relevant ones, and persists exactly the articles that
 * will be passed on to sentiment analysis.
 */
export async function fetchNewsStage(predictionId: string, team1: string, team2: string) {
  const stageId = await startStage(predictionId, "fetch_news");

  try {
    const provider = getNewsProvider();
    const candidates = await provider.search(`"${team1}" OR "${team2}"`);

    const relevant = candidates.filter((c) => isRelevant(c, team1, team2));
    const excludedCount = candidates.length - relevant.length;

    const saved = await Promise.all(
      relevant.map(async (article) => {
        const [row] = await db
          .insert(newsArticles)
          .values({
            providerArticleId: article.providerArticleId,
            source: article.source,
            title: article.title,
            body: article.body,
            publishedAt: article.publishedAt,
            filterMetadata: { matchedTeams: [team1, team2], relevanceWindowDays: RELEVANCE_WINDOW_DAYS },
          })
          .onConflictDoUpdate({
            target: [newsArticles.source, newsArticles.providerArticleId],
            set: { title: article.title, body: article.body },
          })
          .returning();
        return row;
      }),
    );

    await completeStage(stageId, "News fetched and filtered.", {
      consideredCount: candidates.length,
      savedCount: saved.length,
      excludedCount,
    });

    return saved;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
