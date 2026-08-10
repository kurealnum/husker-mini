import { EspnSportsProvider } from "./espn-provider";
import type { SportsProvider } from "./provider";

export * from "./provider";

/** Selects the configured sports data provider (SPORTS_PROVIDER env var). */
export function getSportsProvider(): SportsProvider {
  const provider = process.env.SPORTS_PROVIDER ?? "espn";
  const baseUrl = process.env.SPORTS_PROVIDER_API_BASE_URL;

  switch (provider) {
    case "espn":
      return new EspnSportsProvider(baseUrl ?? "https://site.api.espn.com/apis/site/v2/sports");
    default:
      throw new Error(`Unsupported sports provider: ${provider}`);
  }
}
