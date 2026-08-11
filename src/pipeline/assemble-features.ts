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
  getTransactions,
  getPlayerGamelog,
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
import type { EspnTransaction } from "@/lib/espn";
import type { SportsGame } from "@/lib/sports/provider";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { technicalAnalyses } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

/** Per-sport stat key used for player-strength/availability production estimates. */
const PRODUCTION_STAT_KEY: Record<string, string> = {
  nfl: "yards",
  ncaaf: "yards",
  nba: "points",
  ncaab: "points",
  nhl: "points",
  mlb: "hits",
};

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
}

/** Fetches a team's roster and, for its inferred starters, their game logs. */
async function fetchStarterGamelogs(sport: string, teamId: string): Promise<PlayerGamelog[]> {
  const roster = await getTeamRoster(sport, teamId);
  const starterIds = inferStarterIds(roster);
  const starters = roster.athletes.flatMap((group) => group.items).filter((a) => starterIds.has(a.id));

  return Promise.all(
    starters.map(async (athlete) => ({
      athlete,
      entries: (
        await getPlayerGamelog(sport, athlete.id).catch((error) => {
          console.warn(`[espn] gamelog unavailable for athlete ${athlete.id}, treating as empty: ${error instanceof Error ? error.message : error}`);
          return { entries: [] };
        })
      ).entries,
    })),
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
): Promise<TeamFeatures> {
  const statKey = PRODUCTION_STAT_KEY[sport] ?? "points";

  const [gamelogs, injuriesResponse, roster] = await Promise.all([
    fetchStarterGamelogs(sport, teamId),
    getTeamInjuries(sport, teamId),
    getTeamRoster(sport, teamId),
  ]);

  const starterIds = inferStarterIds(roster);
  const injuredPlayers = computeInjuredPlayers(injuriesResponse.items, starterIds, gamelogs, statKey);

  return {
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

    const [team1Features, team2Features] = await Promise.all([
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

    const seasonWindow = readSeasonWindow();
    const market = oddsResponse
      ? extractMarketSnapshot(oddsResponse, new Date().toISOString())
      : null;

    const features: GameFeatures = {
      team1: team1Features,
      team2: team2Features,
      seasonStage: seasonWindow
        ? classifySeasonStage(game.gameDate, seasonWindow.start, seasonWindow.end, seasonWindow.playoffStart)
        : null,
      matchup: computeMatchup(team1Games, team1Strength, team2Games, team2Strength),
      market,
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
