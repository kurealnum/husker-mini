/** Current state of a single team in a game. */
export interface SportsTeam {
  name: string;
  abbreviation: string;
  score: number;
}

export type SportsGameStatus = "scheduled" | "in_progress" | "final";

export interface SportsGame {
  team1: SportsTeam;
  team2: SportsTeam;
  status: SportsGameStatus;
  /** Fraction of the game elapsed (0 at start, 1 at scheduled end, may exceed 1 in overtime). */
  gameProgress: number;
}

export interface FindGameParams {
  sport: string;
  team1: string;
  team2: string;
}

/** Replaceable interface for any sports data source (scores, status, game-clock progress). */
export interface SportsProvider {
  findGame(params: FindGameParams): Promise<SportsGame | null>;
}
