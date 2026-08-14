/**
 * Single source of truth for every league the pipeline knows how to run.
 * Replaces the five previously-duplicated per-sport tables (ESPN_LEAGUE_PATHS,
 * ESPN_SPORT_PATHS, SPORT_PERIODS, PRODUCTION_STAT_KEY, SERIES_PREFIX_TO_SPORT).
 * Every read of league facts anywhere in the codebase must go through this file.
 */

import { FOOTBALL_MODEL_VERSION } from "@/lib/football-win-probability-model";
import { NBA_MODEL_VERSION, NCAAB_MODEL_VERSION } from "@/lib/basketball-win-probability-model";
import { HOCKEY_MODEL_VERSION } from "@/lib/hockey-win-probability-model";
import { SOCCER_MODEL_VERSION } from "@/lib/soccer-win-probability-model";
import { TENNIS_MODEL_VERSION } from "@/lib/tennis-win-probability-model";
import { MMA_MODEL_VERSION } from "@/lib/mma-win-probability-model";

/** Raised when a league key or Kalshi ticker series is not in the registry. */
export class UnsupportedLeagueError extends Error {}

/** How a contest's outcome space is shaped. Only `head_to_head` has a pipeline today. */
export type ContestShape = "head_to_head" | "three_way" | "field";

/** What kind of thing competes in this league's contests. */
export type CompetitorKind = "team" | "athlete";

/** Which strategy computes fraction of contest elapsed for this league. */
export type ProgressModel = "clock_periods" | "innings" | "count_up_clock" | "set_based";

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
    winProbabilityModelVersion: FOOTBALL_MODEL_VERSION,
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
    // Shares NFL's model rather than a separate NCAAF fit: the backtest
    // (scripts/backtest-football-model.ts) only has enough NFL volume to
    // fit against today, and NCAAF's much wider team-strength spread and
    // larger field mean an NFL-fit model will be less confident but not
    // wrong-signed for it. Revisit with a dedicated NCAAF backtest once
    // per-league config (issue #159) volume justifies separate coefficients.
    winProbabilityModelVersion: FOOTBALL_MODEL_VERSION,
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
    winProbabilityModelVersion: NBA_MODEL_VERSION,
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
    // NBA and NCAAB get separate coefficients, unlike NFL/NCAAF sharing one
    // football model: backtesting both (scripts/backtest-basketball-model.ts,
    // scripts/backtest-ncaab-model.ts) found meaningfully different fitted
    // intercepts/weights, not just a confidence difference. See
    // src/lib/basketball-win-probability-model.ts.
    winProbabilityModelVersion: NCAAB_MODEL_VERSION,
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
    winProbabilityModelVersion: HOCKEY_MODEL_VERSION,
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

  // Soccer feature sources per docs/espn-endpoint-audit.md: roster/injuries/
  // transactions usable, athlete gamelog 500s and athlete stats 404 for
  // every sampled league — same limitation the issue #164 audit found.
  // Registered leagues are limited to those docs/kalshi-series-audit.md
  // showed real tradeable volume for (KXBUNDESLIGAGAME had zero and is
  // deliberately excluded).
  "eng.1": {
    key: "eng.1",
    family: "soccer",
    displayName: "English Premier League",
    tickerPrefix: "KXEPLGAME",
    espnSportSegment: "soccer",
    espnLeagueSegment: "eng.1",
    contestShape: "three_way",
    competitorKind: "team",
    progressModel: "count_up_clock",
    periods: { count: 2, secondsPerPeriod: 2700 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "goals",
    espnFeatureSources: { injuries: true, roster: true, schedule: false, gamelog: false, transactions: true },
    winProbabilityModelVersion: SOCCER_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  "esp.1": {
    key: "esp.1",
    family: "soccer",
    displayName: "La Liga",
    tickerPrefix: "KXLALIGAGAME",
    espnSportSegment: "soccer",
    espnLeagueSegment: "esp.1",
    contestShape: "three_way",
    competitorKind: "team",
    progressModel: "count_up_clock",
    periods: { count: 2, secondsPerPeriod: 2700 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "goals",
    espnFeatureSources: { injuries: true, roster: true, schedule: false, gamelog: false, transactions: true },
    winProbabilityModelVersion: SOCCER_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  "ita.1": {
    key: "ita.1",
    family: "soccer",
    displayName: "Serie A",
    tickerPrefix: "KXSERIEAGAME",
    espnSportSegment: "soccer",
    espnLeagueSegment: "ita.1",
    contestShape: "three_way",
    competitorKind: "team",
    progressModel: "count_up_clock",
    periods: { count: 2, secondsPerPeriod: 2700 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "goals",
    espnFeatureSources: { injuries: true, roster: true, schedule: false, gamelog: false, transactions: true },
    winProbabilityModelVersion: SOCCER_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  "fra.1": {
    key: "fra.1",
    family: "soccer",
    displayName: "Ligue 1",
    tickerPrefix: "KXLIGUE1GAME",
    espnSportSegment: "soccer",
    espnLeagueSegment: "fra.1",
    contestShape: "three_way",
    competitorKind: "team",
    progressModel: "count_up_clock",
    periods: { count: 2, secondsPerPeriod: 2700 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "goals",
    espnFeatureSources: { injuries: true, roster: true, schedule: false, gamelog: false, transactions: true },
    winProbabilityModelVersion: SOCCER_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  "usa.1": {
    key: "usa.1",
    family: "soccer",
    displayName: "MLS",
    tickerPrefix: "KXMLSGAME",
    espnSportSegment: "soccer",
    espnLeagueSegment: "usa.1",
    contestShape: "three_way",
    competitorKind: "team",
    progressModel: "count_up_clock",
    periods: { count: 2, secondsPerPeriod: 2700 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "goals",
    espnFeatureSources: { injuries: true, roster: true, schedule: true, gamelog: false, transactions: true },
    winProbabilityModelVersion: SOCCER_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  "uefa.champions": {
    key: "uefa.champions",
    family: "soccer",
    displayName: "UEFA Champions League",
    tickerPrefix: "KXUCLGAME",
    espnSportSegment: "soccer",
    espnLeagueSegment: "uefa.champions",
    contestShape: "three_way",
    competitorKind: "team",
    progressModel: "count_up_clock",
    periods: { count: 2, secondsPerPeriod: 2700 },
    scoreSemantics: { higherWins: true, additive: true },
    productionStatKey: "goals",
    espnFeatureSources: { injuries: true, roster: true, schedule: false, gamelog: false, transactions: true },
    winProbabilityModelVersion: SOCCER_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },

  // Tennis: the first athlete-competitor family. No team, roster, or
  // injury endpoint is called anywhere in its pipeline (issue #165) — the
  // fields below that exist only for team-sport bookkeeping
  // (`productionStatKey`, `espnFeatureSources`) are unused placeholders,
  // not claims that this data is fetched.
  atp: {
    key: "atp",
    family: "tennis",
    displayName: "ATP",
    tickerPrefix: "KXATPMATCH",
    espnSportSegment: "tennis",
    espnLeagueSegment: "atp",
    contestShape: "head_to_head",
    competitorKind: "athlete",
    progressModel: "set_based",
    // Nominal best-of-3; TennisSportsProvider detects best-of-5 (ATP majors)
    // per match from ESPN's `event.major` flag rather than from this
    // registry-level constant, since it varies by tournament, not by tour.
    periods: { count: 3, secondsPerPeriod: 0 },
    scoreSemantics: { higherWins: true, additive: false },
    productionStatKey: "aces",
    espnFeatureSources: { injuries: false, roster: false, schedule: false, gamelog: false, transactions: false },
    winProbabilityModelVersion: TENNIS_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },
  wta: {
    key: "wta",
    family: "tennis",
    displayName: "WTA",
    tickerPrefix: "KXWTAMATCH",
    espnSportSegment: "tennis",
    espnLeagueSegment: "wta",
    contestShape: "head_to_head",
    competitorKind: "athlete",
    progressModel: "set_based",
    // WTA is always best-of-3, even at majors — no per-match detection needed.
    periods: { count: 3, secondsPerPeriod: 0 },
    scoreSemantics: { higherWins: true, additive: false },
    productionStatKey: "aces",
    espnFeatureSources: { injuries: false, roster: false, schedule: false, gamelog: false, transactions: false },
    winProbabilityModelVersion: TENNIS_MODEL_VERSION,
    combinerPayloadBudgetBytes: DEFAULT_COMBINER_PAYLOAD_BUDGET_BYTES,
  },

  // MMA: the thinnest data of any league here. Only UFC is registered —
  // KXMMAFIGHT (other promotions: PFL, Bellator, ...) had real Kalshi
  // volume too (docs/kalshi-series-audit.md), but no other promotion's
  // ESPN league slug has been confirmed to resolve the same way "ufc"
  // does, so it's deliberately left unregistered rather than guessed at.
  // No roster/injury/gamelog/stats endpoint exists for MMA at all
  // (confirmed 404 across the board) — espnFeatureSources is all false,
  // and this league's pipeline never calls any of them.
  ufc: {
    key: "ufc",
    family: "mma",
    displayName: "UFC",
    tickerPrefix: "KXUFCFIGHT",
    espnSportSegment: "mma",
    espnLeagueSegment: "ufc",
    contestShape: "head_to_head",
    competitorKind: "athlete",
    progressModel: "clock_periods",
    // Nominal default; MmaSportsProvider reads the actual round count
    // (3 or 5 for title fights) per fight from `format.regulation.periods`.
    periods: { count: 3, secondsPerPeriod: 300 },
    scoreSemantics: { higherWins: true, additive: false },
    productionStatKey: "significantStrikes",
    espnFeatureSources: { injuries: false, roster: false, schedule: false, gamelog: false, transactions: false },
    winProbabilityModelVersion: MMA_MODEL_VERSION,
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
