import { NewsApiProvider } from "./newsapi-provider";
import type { NewsArticleCandidate, NewsProvider } from "./provider";

export * from "./provider";

/** TEMP STUB: skip the news API for local testing. Unset STUB_EXTERNAL_CALLS to restore. */
class StubNewsProvider implements NewsProvider {
  async search(query: string): Promise<NewsArticleCandidate[]> {
    return [
      {
        providerArticleId: "stub-1",
        source: "Stub News",
        title: `${query}: stubbed headline`,
        body: "Stubbed article body (STUB_EXTERNAL_CALLS=true).",
        publishedAt: new Date(),
      },
    ];
  }
}

/** Selects the configured news provider from NEWS_PROVIDER_API_* env vars. */
export function getNewsProvider(): NewsProvider {
  if (process.env.STUB_EXTERNAL_CALLS === "true") {
    return new StubNewsProvider();
  }

  const baseUrl = process.env.NEWS_PROVIDER_API_BASE_URL;
  const apiKey = process.env.NEWS_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("NEWS_PROVIDER_API_BASE_URL and NEWS_PROVIDER_API_KEY must be configured.");
  }
  return new NewsApiProvider(baseUrl, apiKey);
}
