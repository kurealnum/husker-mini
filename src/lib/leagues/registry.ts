/**
 * Single source of truth for every league the pipeline knows how to run.
 * Replaces the five previously-duplicated per-sport tables (ESPN_LEAGUE_PATHS,
 * ESPN_SPORT_PATHS, SPORT_PERIODS, PRODUCTION_STAT_KEY, SERIES_PREFIX_TO_SPORT).
 * Every read of league facts anywhere in the codebase must go through this file.
 */

/** Raised when a league key or Kalshi ticker series is not in the registry. */
export class UnsupportedLeagueError extends Error {}

/** How a contest's outcome space is shaped. Only `head_to_head` has a pipeline today. */
export type ContestShape = "head_to_head" | "three_way" | "field";

/** What kind of thing competes in this league's contests. */
export type CompetitorKind = "team" | "athlete";

/** Which strategy computes fraction of contest elapsed for this league. */
export type ProgressModel = "clock_periods" | "innings";

export interface LeagueDefinition {
  /** Stable registry key, also the value stored in `predictions.league`. */
  key: string;
  /** Sport family this league belongs to (e.g. "football"), stored in `predictions.sport`. */
  family: string;
  /** Human-readable name. */
  displayName: string;
  /** Kalshi ticker series prefix that maps to this league (e.g. "KXNFLGAME"). */
  tickerPrefix: string;
  /** ESPN sport path segment (e.g. "football"). */
  espnSportSegment: string;
  /** ESPN league path segment (e.g. "nfl"). */
  espnLeagueSegment: string;
  contestShape: ContestShape;
  competitorKind: CompetitorKind;
  progressModel: ProgressModel;
  /** Number of scoring periods, and the clock length of each in seconds (0 for unclocked sports like baseball). */
  periods: { count: number; secondsPerPeriod: number };
  scoreSemantics: {
    /** Whether a higher score wins the contest (false for e.g. golf strokes). */
    higherWins: boolean;
    /** Whether scores accumulate additively across the contest (true for team sports). */
    additive: boolean;
  };
  /** Key into a team's box score used as the "production" stat for player-strength features. */
  productionStatKey: string;
  /** Which ESPN feature sources are known to be available for this league. */
  espnFeatureSources: {
    injuries: boolean;
    roster: boolean;
    schedule: boolean;
    gamelog: boolean;
    transactions: boolean;
  };
  /** Version of the win-probability model that applies to this league. */
  winProbabilityModelVersion: string;
  /**
   * Max serialized byte size of this league's raw ESPN data sent to the
   * combiner (see `CombinerInputs.maxPayloadBytes`). Per-league so one
   * sport's larger payload can't alone exhaust the shared OpenAI
   * tokens-per-minute budget while other leagues run concurrently.
   */
  combinerPayloadBudgetBytes: number;
}

const CLOCK_FEATURES = { injuries: true, roster: true, schedule: true, gamelog: true, transactions: true } as const;

const ESPN_MODEL_VERSION = "1.0.0";
const DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES = 8000;

export const LEAGUE_REGISTRY: Record<string, LeagueDefinition> = {
  nfl: {
    key: "nfl",
    family: "football",
    displayName: "NFL",
    tickerPrefix: "KXNFLGAME",
    espnSportSegment: "football",
    espnLeagueSegment: "nfl",
    contestShape: "head_to_head",
    competitorKind: "team",
    progressModel: "clock_periods",
    periods: { count: 4, secondsPerPeriod: 900 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "yards",
    espnFeatureSources: CLOCK_FEATURES,
    winProbabilityModelVersion: ESPN_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  ncaaf: {
    key: "ncaaf",
    family: "football",
    displayName: "NCAA Football",
    tickerPrefix: "KXNCAAFGAME",
    espnSportSegment: "football",
    espnLeagueSegment: "college-football",
    contestShape: "head_to_head",
    competitorKind: "team",
    progressModel: "clock_periods",
    periods: { count: 4, secondsPerPeriod: 900 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "yards",
    espnFeatureSources: CLOCK_FEATURES,
    winProbabilityModelVersion: ESPN_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  nba: {
    key: "nba",
    family: "basketball",
    displayName: "NBA",
    tickerPrefix: "KXNBAGAME",
    espnSportSegment: "basketball",
    espnLeagueSegment: "nba",
    contestShape: "head_to_head",
    competitorKind: "team",
    progressModel: "clock_periods",
    periods: { count: 4, secondsPerPeriod: 720 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "points",
    espnFeatureSources: CLOCK_FEATURES,
    winProbabilityModelVersion: ESPN_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  ncaab: {
    key: "ncaab",
    family: "basketball",
    displayName: "NCAA Men's Basketball",
    tickerPrefix: "KXNCAABGAME",
    espnSportSegment: "basketball",
    espnLeagueSegment: "mens-college-basketball",
    contestShape: "head_to_head",
    competitorKind: "team",
    progressModel: "clock_periods",
    periods: { count: 2, secondsPerPeriod: 1200 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "points",
    espnFeatureSources: CLOCK_FEATURES,
    winProbabilityModelVersion: ESPN_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  nhl: {
    key: "nhl",
    family: "hockey",
    displayName: "NHL",
    tickerPrefix: "KXNHLGAME",
    espnSportSegment: "hockey",
    espnLeagueSegment: "nhl",
    contestShape: "head_to_head",
    competitorKind: "team",
    progressModel: "clock_periods",
    periods: { count: 3, secondsPerPeriod: 1200 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "points",
    espnFeatureSources: CLOCK_FEATURES,
    winProbabilityModelVersion: ESPN_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  mlb: {
    key: "mlb",
    family: "baseball",
    displayName: "MLB",
    tickerPrefix: "KXMLBGAME",
    espnSportSegment: "baseball",
    espnLeagueSegment: "mlb",
    contestShape: "head_to_head",
    competitorKind: "team",
    progressModel: "innings",
    periods: { count: 9, secondsPerPeriod: 0 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "hits",
    espnFeatureSources: CLOCK_FEATURES,
    winProbabilityModelVersion: ESPN_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
};

/** Looks up a league by its registry key. Throws `UnsupportedLeagueError` if unknown. */
export function getLeague(key: string): LeagueDefinition {
  const league = LEAGUE_REGISTRY[key];
  if (!league) {
    throw new UnsupportedLeagueError(`Unsupported league: ${key}`);
  }
  return league;
}

/** ESPN path segment for a league, e.g. "football/nfl". */
export function espnLeaguePath(key: string): string {
  const league = getLeague(key);
  return `${league.espnSportSegment}/${league.espnLeagueSegment}`;
}

/** Resolves the league registered for a Kalshi ticker's series prefix. */
export function resolveLeagueFromTicker(ticker: string): LeagueDefinition {
  const seriesPrefix = ticker.split("-")[0];
  const league = Object.values(LEAGUE_REGISTRY).find((l) => l.tickerPrefix === seriesPrefix);
  if (!league) {
    throw new UnsupportedLeagueError(`Unsupported or unrecognized Kalshi ticker series: ${seriesPrefix}`);
  }
  return league;
}
