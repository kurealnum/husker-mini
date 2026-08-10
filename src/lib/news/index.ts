import { NewsApiProvider } from "./newsapi-provider";
import type { NewsProvider } from "./provider";

export * from "./provider";

/** Selects the configured news provider from NEWS_PROVIDER_API_* env vars. */
export function getNewsProvider(): NewsProvider {
  const baseUrl = process.env.NEWS_PROVIDER_API_BASE_URL;
  const apiKey = process.env.NEWS_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("NEWS_PROVIDER_API_BASE_URL and NEWS_PROVIDER_API_KEY must be configured.");
  }
  return new NewsApiProvider(baseUrl, apiKey);
}
