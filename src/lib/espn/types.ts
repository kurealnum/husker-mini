/** Typed response models for the subset of ESPN's public site/core API consumed by this app. */

/** A team as ESPN reports it inside scoreboard/roster/standings payloads. */
export interface EspnTeam {
  id: string;
  displayName: string;
  abbreviation: string;
  location: string;
  name: string;
}

/** One competitor entry (a team's side) within a competition/game. */
export interface EspnCompetitor {
  id: string;
  homeAway: "home" | "away";
  team: EspnTeam;
  score: string;
  winner?: boolean;
}

export interface EspnStatusType {
  completed: boolean;
  state: "pre" | "in" | "post";
  description: string;
}

export interface EspnStatus {
  type: EspnStatusType;
  period: number;
  displayClock: string;
}

export interface EspnCompetition {
  id: string;
  date: string;
  competitors: EspnCompetitor[];
  status: EspnStatus;
}

export interface EspnEvent {
  id: string;
  date: string;
  competitions: EspnCompetition[];
}

/** Response shape of `/scoreboard`. */
export interface EspnScoreboardResponse {
  events: EspnEvent[];
}

/** Response shape of `/teams`. */
export interface EspnTeamsResponse {
  sports: Array<{
    leagues: Array<{
      teams: Array<{ team: EspnTeam }>;
    }>;
  }>;
}

export interface EspnAthlete {
  id: string;
  fullName: string;
  displayName: string;
  position?: { abbreviation: string };
  injuries?: EspnInjury[];
}

/** Response shape of `/teams/{id}/roster`. */
export interface EspnRosterResponse {
  team: EspnTeam;
  athletes: Array<{
    position: string;
    items: EspnAthlete[];
  }>;
}

export interface EspnStandingsRecordStat {
  name: string;
  value: number;
  displayValue: string;
}

export interface EspnStandingsEntry {
  team: EspnTeam;
  stats: EspnStandingsRecordStat[];
}

/** Response shape of `/standings`. */
export interface EspnStandingsResponse {
  children: Array<{
    standings: { entries: EspnStandingsEntry[] };
  }>;
}

export interface EspnScheduleEvent {
  id: string;
  date: string;
  competitions: EspnCompetition[];
}

/** Response shape of `/teams/{id}/schedule`. */
export interface EspnTeamScheduleResponse {
  events: EspnScheduleEvent[];
}

export interface EspnInjury {
  status: string;
  date?: string;
  details?: {
    type?: string;
    location?: string;
    detail?: string;
    side?: string;
    returnDate?: string;
  };
  athlete?: { id: string; displayName: string };
}

/** Response shape of `/teams/{id}/injuries`. */
export interface EspnTeamInjuriesResponse {
  items: EspnInjury[];
}

export interface EspnTransaction {
  date: string;
  description: string;
  team?: { id: string };
}

/** Response shape of `/transactions`. */
export interface EspnTransactionsResponse {
  transactions: EspnTransaction[];
}

export interface EspnGamelogEntry {
  gameId: string;
  date: string;
  opponentId?: string;
  stats: Record<string, number>;
}

/** Response shape of an athlete's gamelog endpoint. */
export interface EspnAthleteGamelogResponse {
  entries: EspnGamelogEntry[];
}

export interface EspnOddsProvider {
  id: string;
  name: string;
}

export interface EspnOdds {
  provider: EspnOddsProvider;
  details: string;
  overUnder?: number;
  spread?: number;
  homeTeamOdds?: { moneyLine?: number; spreadOdds?: number };
  awayTeamOdds?: { moneyLine?: number; spreadOdds?: number };
}

/** Response shape of a game's odds endpoint (core API). */
export interface EspnOddsResponse {
  items: EspnOdds[];
}
