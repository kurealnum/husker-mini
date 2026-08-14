/** One competitor's state within a contest (a team, or an athlete in individual sports). */
export interface SportsCompetitor {
  id: string | null;
  name: string;
  abbreviation: string;
  score: number;
  isHome: boolean;
}

export type SportsGameStatus = "scheduled" | "in_progress" | "final";

/**
 * A contest as a list of competitors, generalizing beyond the two-team case.
 * Head-to-head leagues (all leagues today) always populate exactly two
 * competitors; `headToHead()` narrows to that case for pipelines that only
 * ever deal with two competitors.
 */
export interface Contest {
  competitors: SportsCompetitor[];
  status: SportsGameStatus;
  gameProgress: number;
  gameDate: string;
  espnEventId: string;
}

/** Two-competitor view of a contest, for pipelines that only handle head-to-head leagues. */
export interface HeadToHeadContest {
  team1: SportsCompetitor;
  team2: SportsCompetitor;
  status: SportsGameStatus;
  gameProgress: number;
  gameDate: string;
  espnEventId: string;
}

/** Narrows a `Contest` to its two-competitor view. Throws if it doesn't hold exactly two. */
export function headToHead(contest: Contest): HeadToHeadContest {
  const [team1, team2] = contest.competitors;
  if (!team1 || !team2 || contest.competitors.length !== 2) {
    throw new Error(`Expected exactly two competitors for a head-to-head contest, got ${contest.competitors.length}.`);
  }
  return { team1, team2, status: contest.status, gameProgress: contest.gameProgress, gameDate: contest.gameDate, espnEventId: contest.espnEventId };
}

/** @deprecated Use `Contest` / `headToHead()`. Kept as an alias during the migration. */
export type SportsGame = HeadToHeadContest;

export interface FindGameParams { league: string; team1: string; team2: string; }

export interface SportsProvider {
  findGame(params: FindGameParams): Promise<Contest | null>;
}
