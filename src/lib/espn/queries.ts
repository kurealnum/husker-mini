/**
 * Query functions exposed to the rest of the app. This is the only module
 * that should be imported outside `src/lib/espn/` — nothing else may touch
 * `EspnClient` or parse raw ESPN response shapes directly.
 */
import { espnClient, leaguePath } from "./client";
import type {
  EspnAthleteGamelogResponse,
  EspnOddsResponse,
  EspnRosterResponse,
  EspnScoreboardResponse,
  EspnStandingsResponse,
  EspnTeamInjuriesResponse,
  EspnTeamsResponse,
  EspnTransactionsResponse,
} from "./types";

/** Current scoreboard (today's games by default) for a sport/league. */
export async function getScoreboard(sport: string): Promise<EspnScoreboardResponse> {
  return espnClient.getSite<EspnScoreboardResponse>(`${leaguePath(sport)}/scoreboard`);
}

/** All teams in a league. */
export async function getTeams(sport: string): Promise<EspnTeamsResponse> {
  return espnClient.getSite<EspnTeamsResponse>(`${leaguePath(sport)}/teams`, { ttlMs: 6 * 60 * 60_000 });
}

/** Full roster for a team. */
export async function getTeamRoster(sport: string, teamId: string): Promise<EspnRosterResponse> {
  return espnClient.getSite<EspnRosterResponse>(`${leaguePath(sport)}/teams/${teamId}/roster`, {
    ttlMs: 60 * 60_000,
  });
}

/** League standings, used to derive win rate / opponent-adjusted strength. */
export async function getStandings(sport: string): Promise<EspnStandingsResponse> {
  return espnClient.getSite<EspnStandingsResponse>(`${leaguePath(sport)}/standings`, {
    ttlMs: 60 * 60_000,
  });
}

/** A team's current record, pulled from standings. Null if the team isn't found. */
export async function getTeamRecord(
  sport: string,
  teamId: string,
): Promise<EspnStandingsResponse["children"][number]["standings"]["entries"][number] | null> {
  const standings = await getStandings(sport);
  for (const group of standings.children) {
    const entry = group.standings.entries.find((e) => e.team.id === teamId);
    if (entry) return entry;
  }
  return null;
}

/** Active injuries reported for a team's roster. */
export async function getTeamInjuries(
  sport: string,
  teamId: string,
): Promise<EspnTeamInjuriesResponse> {
  return espnClient.getSite<EspnTeamInjuriesResponse>(
    `${leaguePath(sport)}/teams/${teamId}/injuries`,
    { ttlMs: 15 * 60_000 },
  );
}

/** Recent league transactions (trades, signings, waivers). */
export async function getTransactions(sport: string): Promise<EspnTransactionsResponse> {
  return espnClient.getSite<EspnTransactionsResponse>(`${leaguePath(sport)}/transactions`, {
    ttlMs: 15 * 60_000,
  });
}

/** Game-by-game log for a player, used for recent-form and volatility metrics. */
export async function getPlayerGamelog(
  sport: string,
  athleteId: string,
): Promise<EspnAthleteGamelogResponse> {
  return espnClient.getCore<EspnAthleteGamelogResponse>(
    `${leaguePath(sport)}/athletes/${athleteId}/gamelog`,
    { ttlMs: 60 * 60_000 },
  );
}

/** Betting odds/lines for a specific game (core API, `event/{eventId}` scoped). */
export async function getGameOdds(sport: string, eventId: string): Promise<EspnOddsResponse> {
  return espnClient.getCore<EspnOddsResponse>(
    `${leaguePath(sport)}/events/${eventId}/competitions/${eventId}/odds`,
    { ttlMs: 5 * 60_000 },
  );
}
