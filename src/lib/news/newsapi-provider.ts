import type { NewsArticleCandidate, NewsProvider } from "./provider";

interface NewsApiArticle {
  url: string;
  title: string;
  description: string | null;
  content: string | null;
  publishedAt: string;
  source: { name: string };
}

interface NewsApiResponse {
  status: string;
  articles: NewsApiArticle[];
}

/** https://newsapi.org "everything" search endpoint. */
export class NewsApiProvider implements NewsProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async search(query: string): Promise<NewsArticleCandidate[]> {
    const url = new URL(`${this.baseUrl}/everything`);
    url.searchParams.set("q", query);
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("language", "en");
    url.searchParams.set("pageSize", "50");

    const response = await fetch(url, { headers: { "X-Api-Key": this.apiKey } });
    if (!response.ok) {
      throw new Error(`News provider request failed (${response.status}).`);
    }

    const data = (await response.json()) as NewsApiResponse;
    return data.articles.map((article) => ({
      providerArticleId: article.url,
      source: article.source.name,
      title: article.title,
      body: article.description ?? article.content,
      publishedAt: new Date(article.publishedAt),
    }));
  }
}
