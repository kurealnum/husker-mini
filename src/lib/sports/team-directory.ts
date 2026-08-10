import { ESPN_SPORT_PATHS } from "./espn-provider";

export interface SportsTeamInfo {
  displayName: string;
  abbreviation: string;
}

interface EspnTeamsResponse {
  sports: Array<{
    leagues: Array<{
      teams: Array<{ team: { displayName: string; abbreviation: string } }>;
    }>;
  }>;
}

/** Fetches the full team roster for a sport, used to resolve team names out of event titles. */
export async function fetchTeamDirectory(sport: string, baseUrl: string): Promise<SportsTeamInfo[]> {
  const path = ESPN_SPORT_PATHS[sport];
  if (!path) {
    throw new Error(`Unsupported sport for team directory: ${sport}`);
  }

  const response = await fetch(`${baseUrl}/${path}/teams?limit=999`);
  if (!response.ok) {
    throw new Error(`ESPN teams request failed (${response.status}).`);
  }

  const data = (await response.json()) as EspnTeamsResponse;
  return data.sports.flatMap((s) =>
    s.leagues.flatMap((l) =>
      l.teams.map((t) => ({
        displayName: t.team.displayName,
        abbreviation: t.team.abbreviation,
      })),
    ),
  );
}
