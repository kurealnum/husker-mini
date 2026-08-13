import { espnLeaguePath } from "@/lib/leagues/registry";

export interface SportsTeamInfo {
  /** ESPN's team id, used to key every analytics-module ESPN query for this team. */
  id: string;
  displayName: string;
  abbreviation: string;
  location: string;
}

interface EspnTeamsResponse {
  sports: Array<{
    leagues: Array<{
      teams: Array<{ team: { id: string; displayName: string; abbreviation: string; location: string } }>;
    }>;
  }>;
}

/** Fetches the full team roster for a league, used to resolve team names out of event titles. */
export async function fetchTeamDirectory(league: string, baseUrl: string): Promise<SportsTeamInfo[]> {
  const path = espnLeaguePath(league);

  const response = await fetch(`${baseUrl}/${path}/teams?limit=999`);
  if (!response.ok) {
    throw new Error(`ESPN teams request failed (${response.status}).`);
  }

  const data = (await response.json()) as EspnTeamsResponse;
  return data.sports.flatMap((s) =>
    s.leagues.flatMap((l) =>
      l.teams.map((t) => ({
        id: t.team.id,
        displayName: t.team.displayName,
        abbreviation: t.team.abbreviation,
        location: t.team.location,
      })),
    ),
  );
}
