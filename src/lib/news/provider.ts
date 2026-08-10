export interface NewsArticleCandidate {
  providerArticleId: string;
  source: string;
  title: string;
  body: string | null;
  publishedAt: Date;
}

export interface NewsProvider {
  search(query: string): Promise<NewsArticleCandidate[]>;
}
