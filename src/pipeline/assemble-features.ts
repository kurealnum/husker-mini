/**
 * Assembles the full analytics feature tree for a game (team strength, recent
 * form, player strength, availability, matchup, context, market) by calling
 * the `@/lib/analytics/*` modules with data fetched through `@/lib/espn`.
 *
 * Market line movement needs multiple `getGameOdds` snapshots captured over
 * time; this stage only ever runs once per prediction, so it captures a
 * single on-demand snapshot rather than movement. Tracking movement would
 * require a separate polling job (e.g. a scheduled worker) that captures
 * snapshots throughout the game and is a deliberate follow-up, not handled here.
 */
import {
  getGameOdds,
  getTeamInjuries,
  getTeamRoster,
  getTeamSchedule,
  getTransactions,
  getPlayerGamelog,
} from "@/lib/espn";
import type {
  EspnRosterResponse,
  EspnTeamInjuriesResponse,
  EspnTeamScheduleResponse,
} from "@/lib/espn";
import {
  computeInjuredPlayers,
  hasStarterAvailabilityRisk,
  inferStarterIds,
  totalEstimatedLostProduction,
  type InjuredPlayer,
} from "@/lib/analytics/player-availability";
import { computeMatchup, type MatchupAnalysis } from "@/lib/analytics/matchup";
import {
  classifySeasonStage,
  homeAwayFlag,
  recentTeamTransactions,
  restDays,
  type HomeAwayFlag,
  type SeasonStage,
} from "@/lib/analytics/game-context";
import { extractMarketSnapshot, type MarketSnapshot } from "@/lib/analytics/market";
import {
  aggregatePlayerStats,
  recentPlayerForm,
  topPlayerStats,
  type PlayerGamelog,
  type RecentPlayerForm,
  type TopPlayerStat,
} from "@/lib/analytics/player-strength";
import { computeRecentForm, type RecentForm } from "@/lib/analytics/recent-form";
import {
  computeTeamStrength,
  fetchCompletedGames,
  type CompletedGame,
  type TeamStrength,
} from "@/lib/analytics/team-strength";
import { deriveWinProbabilityFeatures } from "@/lib/analytics/win-probability-features";
import { computeFootballWinProbability } from "@/lib/football-win-probability-model";
import { computeEspnWinProbability, ESPN_MODEL_VERSION } from "@/lib/win-probability-model";
import type { EspnTransaction } from "@/lib/espn";
import type { SportsGame } from "@/lib/sports/provider";
import { getLeague } from "@/lib/leagues/registry";

/**
 * Selects the win-probability model + version for a league's family.
 * Football gets its own fitted coefficients (`computeFootballWinProbability`);
 * every other family still uses the original MLB model until its own
 * rebuild issue lands. `eloDiff`/`batterRatingDiff` are computed identically
 * for every league (see `deriveWinProbabilityFeatures`) — only the
 * coefficients applied to them differ per model.
 */
function computeLeagueWinProbability(
  sport: string,
  features: ReturnType<typeof deriveWinProbabilityFeatures>["features"],
): { probability: number; modelVersion: string } {
  const { family } = getLeague(sport);
  if (family === "football") {
    return {
      probability: computeFootballWinProbability({
        eloDiff: features.eloDiff,
        playerRatingDiff: features.batterRatingDiff,
      }),
      modelVersion: getLeague(sport).winProbabilityModelVersion,
    };
  }
  return { probability: computeEspnWinProbability(features), modelVersion: ESPN_MODEL_VERSION };
}
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { technicalAnalyses } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

export interface TeamFeatures {
  teamId: string;
  strength: TeamStrength;
  recentForm: RecentForm;
  playerStrength: {
    aggregate: { total: number; average: number };
    top: TopPlayerStat[];
    recentForm: RecentPlayerForm[];
  };
  availability: {
    injuredPlayers: InjuredPlayer[];
    totalEstimatedLostProduction: number;
    hasStarterAvailabilityRisk: boolean;
  };
  context: {
    homeAway: HomeAwayFlag;
    restDays: number | null;
    recentTransactions: EspnTransaction[];
  };
}

export interface GameFeatures {
  team1: TeamFeatures;
  team2: TeamFeatures;
  seasonStage: SeasonStage | null;
  matchup: MatchupAnalysis;
  market: MarketSnapshot | null;
  /** ESPN analysis phase probability that team1 wins, from the versioned win-probability model. */
  espnWinProbability: number;
  espnModelVersion: string;
  /**
   * Raw ESPN roster/injuries/schedule for both teams, kept alongside (not
   * instead of) the computed features above. This is what gets sent to the
   * LLM combiner — see `src/lib/openai/combiner.ts` — rather than any of
   * this app's own derived analytics. Gamelogs, odds, and transactions are
   * excluded: they blew the combiner past OpenAI's tokens-per-minute limit
   * (full-season per-starter gamelogs and unfiltered league-wide
   * transactions are the biggest single contributors — see incident
   * 2026-08-12).
   */
  rawEspnData: Record<string, unknown>;
}

interface RawTeamEspnData {
  roster: EspnRosterResponse;
  injuries: EspnTeamInjuriesResponse;
  schedule: EspnTeamScheduleResponse;
}

/** Fetches a team's roster and, for its inferred starters, their game logs. */
async function fetchStarterGamelogs(sport: string, roster: EspnRosterResponse): Promise<PlayerGamelog[]> {
  const starterIds = inferStarterIds(roster);
  const starters = roster.athletes.flatMap((group) => group.items).filter((a) => starterIds.has(a.id));

  return Promise.all(
    starters.map(async (athlete) => {
      const response = await getPlayerGamelog(sport, athlete.id).catch((error) => {
        console.warn(`[espn] gamelog unavailable for athlete ${athlete.id}, treating as empty: ${error instanceof Error ? error.message : error}`);
        return { entries: [] };
      });
      return { athlete, entries: response.entries };
    }),
  );
}

async function assembleTeamFeatures(
  sport: string,
  teamId: string,
  games: CompletedGame[],
  strength: TeamStrength,
  isHome: boolean,
  gameDate: string,
  transactions: EspnTransaction[],
): Promise<{ features: TeamFeatures; raw: RawTeamEspnData }> {
  const statKey = getLeague(sport).productionStatKey;

  const [injuriesResponse, roster, schedule] = await Promise.all([
    getTeamInjuries(sport, teamId),
    getTeamRoster(sport, teamId),
    getTeamSchedule(sport, teamId),
  ]);
  const gamelogs = await fetchStarterGamelogs(sport, roster);

  const starterIds = inferStarterIds(roster);
  const injuredPlayers = computeInjuredPlayers(injuriesResponse.items, starterIds, gamelogs, statKey);

  const features: TeamFeatures = {
    teamId,
    strength,
    recentForm: computeRecentForm(games),
    playerStrength: {
      aggregate: aggregatePlayerStats(gamelogs, statKey),
      top: topPlayerStats(gamelogs, statKey),
      recentForm: recentPlayerForm(gamelogs, statKey),
    },
    availability: {
      injuredPlayers,
      totalEstimatedLostProduction: totalEstimatedLostProduction(injuredPlayers),
      hasStarterAvailabilityRisk: hasStarterAvailabilityRisk(injuredPlayers),
    },
    context: {
      homeAway: homeAwayFlag(isHome),
      restDays: restDays(games, gameDate),
      recentTransactions: recentTeamTransactions(transactions, teamId, gameDate),
    },
  };

  return {
    features,
    raw: { roster, injuries: injuriesResponse, schedule },
  };
}

/** Season window used for `classifySeasonStage`; unset when not configured for the sport. */
function readSeasonWindow(): { start: string; end: string; playoffStart?: string } | null {
  const start = process.env.SEASON_START_DATE;
  const end = process.env.SEASON_END_DATE;
  if (!start || !end) return null;
  return { start, end, playoffStart: process.env.SEASON_PLAYOFF_START_DATE };
}

/**
 * Builds the full analytics feature tree for a resolved game and persists it
 * as this stage's metadata. `game.team1`/`game.team2` must have resolved
 * ESPN team ids (from `EspnSportsProvider.findGame`).
 */
export async function assembleFeaturesStage(predictionId: string, sport: string, game: SportsGame): Promise<GameFeatures> {
  const stageId = await startStage(predictionId, "assemble_features");

  try {
    if (!game.team1.id || !game.team2.id) {
      throw new Error("Cannot assemble features: game is missing resolved ESPN team ids.");
    }

    const [team1Games, team2Games, transactionsResponse, oddsResponse] = await Promise.all([
      fetchCompletedGames(sport, game.team1.id),
      fetchCompletedGames(sport, game.team2.id),
      getTransactions(sport),
      getGameOdds(sport, game.espnEventId).catch((error) => {
        console.warn(`[espn] odds unavailable for event ${game.espnEventId}, treating as no market data: ${error instanceof Error ? error.message : error}`);
        return null;
      }),
    ]);

    const allTeamGames = new Map([
      [game.team1.id, team1Games],
      [game.team2.id, team2Games],
    ]);
    const team1Strength = computeTeamStrength(game.team1.id, allTeamGames);
    const team2Strength = computeTeamStrength(game.team2.id, allTeamGames);

    const [team1Result, team2Result] = await Promise.all([
      assembleTeamFeatures(
        sport,
        game.team1.id,
        team1Games,
        team1Strength,
        game.team1.isHome,
        game.gameDate,
        transactionsResponse.transactions,
      ),
      assembleTeamFeatures(
        sport,
        game.team2.id,
        team2Games,
        team2Strength,
        game.team2.isHome,
        game.gameDate,
        transactionsResponse.transactions,
      ),
    ]);
    const team1Features = team1Result.features;
    const team2Features = team2Result.features;

    const seasonWindow = readSeasonWindow();
    const market = oddsResponse
      ? extractMarketSnapshot(oddsResponse, new Date().toISOString())
      : null;

    const homeIsTeam1 = game.team1.isHome;
    const { features: winProbabilityFeatures, hasSufficientHistory } = deriveWinProbabilityFeatures(
      homeIsTeam1 ? team1Games : team2Games,
      homeIsTeam1 ? team1Features : team2Features,
      homeIsTeam1 ? team2Games : team1Games,
      homeIsTeam1 ? team2Features : team1Features,
    );
    // Below the model's minimum-history floor, fall back to a coin flip
    // rather than trusting stats derived from too few games.
    const { probability: homeWinProbability, modelVersion } = hasSufficientHistory
      ? computeLeagueWinProbability(sport, winProbabilityFeatures)
      : { probability: 0.5, modelVersion: getLeague(sport).winProbabilityModelVersion };
    const espnWinProbability = homeIsTeam1 ? homeWinProbability : 1 - homeWinProbability;

    const rawEspnData: Record<string, unknown> = {
      team1: team1Result.raw,
      team2: team2Result.raw,
    };

    const features: GameFeatures = {
      team1: team1Features,
      team2: team2Features,
      seasonStage: seasonWindow
        ? classifySeasonStage(game.gameDate, seasonWindow.start, seasonWindow.end, seasonWindow.playoffStart)
        : null,
      matchup: computeMatchup(team1Games, team1Strength, team2Games, team2Strength),
      market,
      espnWinProbability,
      espnModelVersion: modelVersion,
      rawEspnData,
    };

    await db
      .update(technicalAnalyses)
      .set({
        espnAnalytics: features as unknown as Record<string, unknown>,
        team1OpponentAdjustedStrength: team1Strength.opponentAdjustedStrength,
        team2OpponentAdjustedStrength: team2Strength.opponentAdjustedStrength,
        team1AvailabilityRisk: team1Features.availability.hasStarterAvailabilityRisk,
        team2AvailabilityRisk: team2Features.availability.hasStarterAvailabilityRisk,
        team1LostProduction: team1Features.availability.totalEstimatedLostProduction,
        team2LostProduction: team2Features.availability.totalEstimatedLostProduction,
        compositeEdge: features.matchup.compositeEdge,
        marketSpread: market?.spread ?? null,
        marketTotal: market?.total ?? null,
        marketMoneylineHome: market?.moneylineHome ?? null,
        marketMoneylineAway: market?.moneylineAway ?? null,
        espnWinProbability,
        espnModelVersion: modelVersion,
      })
      .where(eq(technicalAnalyses.predictionId, predictionId));

    await completeStage(stageId, "Features assembled.", features as unknown as Record<string, unknown>);
    return features;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failStage(stageId, message);
    throw error;
  }
}
