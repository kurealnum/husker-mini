/**
 * Fits and backtests the hockey win-probability model against real,
 * completed NHL games. Same methodology as
 * `scripts/backtest-football-model.ts`: for each team, walk its schedule
 * chronologically, compute each game's pre-game "eloDiff" feature from only
 * the scoring differential of games strictly before it (no future-game
 * leakage), then fit a 1-D logistic regression via gradient descent and
 * report in-sample accuracy. Final scores already include the
 * shootout-deciding goal where applicable (confirmed against live ESPN
 * data), so completed shootout/OT games need no special handling here.
 *
 * Run with: npx tsx scripts/backtest-hockey-model.ts
 */

export {};

const SITE_API_BASE = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl";

/** The most recent fully-completed NBA season, used since the current season has too few played games to fit against. */
const BACKTEST_SEASON = 2025;

interface EspnCompetitor {
  team: { id: string };
  homeAway: "home" | "away";
  score?: { value?: number; displayValue?: string } | string;
}

interface EspnEvent {
  date: string;
  competitions: Array<{
    status: { type: { completed: boolean } };
    competitors: EspnCompetitor[];
  }>;
}

function competitorScore(score: EspnCompetitor["score"]): number {
  if (score == null) return NaN;
  if (typeof score === "string") return Number.parseFloat(score);
  return score.value ?? Number.parseFloat(score.displayValue ?? "");
}

async function fetchTeamIds(): Promise<string[]> {
  const response = await fetch(`${SITE_API_BASE}/teams?limit=999`);
  const data = (await response.json()) as {
    sports: Array<{ leagues: Array<{ teams: Array<{ team: { id: string } }> }> }>;
  };
  return data.sports[0].leagues[0].teams.map((t) => t.team.id);
}

interface Game {
  date: string;
  teamId: string;
  opponentId: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
}

async function fetchTeamGames(teamId: string): Promise<Game[]> {
  const response = await fetch(`${SITE_API_BASE}/teams/${teamId}/schedule?season=${BACKTEST_SEASON}`);
  const data = (await response.json()) as { events: EspnEvent[] };
  const games: Game[] = [];

  for (const event of data.events) {
    const competition = event.competitions[0];
    if (!competition?.status.type.completed) continue;
    const self = competition.competitors.find((c) => c.team.id === teamId);
    const opponent = competition.competitors.find((c) => c.team.id !== teamId);
    if (!self || !opponent) continue;
    const teamScore = competitorScore(self.score);
    const opponentScore = competitorScore(opponent.score);
    if (Number.isNaN(teamScore) || Number.isNaN(opponentScore)) continue;
    games.push({
      date: event.date,
      teamId,
      opponentId: opponent.team.id,
      isHome: self.homeAway === "home",
      teamScore,
      opponentScore,
    });
  }

  return games.sort((a, b) => a.date.localeCompare(b.date));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Fits P(y=1) = sigmoid(intercept + weight * x) via batch gradient descent. */
function fitLogisticRegression(
  x: number[],
  y: number[],
  iterations = 2000,
  learningRate = 0.05,
): { intercept: number; weight: number } {
  let intercept = 0;
  let weight = 0;
  const n = x.length;

  for (let iter = 0; iter < iterations; iter++) {
    let gradIntercept = 0;
    let gradWeight = 0;
    for (let i = 0; i < n; i++) {
      const prediction = sigmoid(intercept + weight * x[i]);
      const error = prediction - y[i];
      gradIntercept += error;
      gradWeight += error * x[i];
    }
    intercept -= (learningRate * gradIntercept) / n;
    weight -= (learningRate * gradWeight) / n;
  }

  return { intercept, weight };
}

async function main() {
  console.error("Fetching NHL team ids...");
  const teamIds = await fetchTeamIds();
  console.error(`${teamIds.length} teams.`);

  const gamesByTeam = new Map<string, Game[]>();
  for (const teamId of teamIds) {
    gamesByTeam.set(teamId, await fetchTeamGames(teamId));
    await sleep(260);
  }

  /** Average scoring differential across a team's games strictly before `beforeDate`. */
  function priorScoringDifferential(teamId: string, beforeDate: string): number {
    const games = (gamesByTeam.get(teamId) ?? []).filter((g) => g.date < beforeDate);
    if (games.length === 0) return 0;
    const total = games.reduce((sum, g) => sum + (g.teamScore - g.opponentScore), 0);
    return total / games.length;
  }

  // Basketball scores are high enough that raw point-differential magnitude
  // dwarfs football's — normalize by dividing by average total score so the
  // feature is a comparable ratio-like scale rather than swamping the fit.
  const eloDiffs: number[] = [];
  const outcomes: number[] = [];
  const seenGameKeys = new Set<string>();

  for (const [teamId, games] of gamesByTeam) {
    for (const game of games) {
      if (!game.isHome) continue; // one row per game, from the home team's perspective
      const key = `${game.date}:${[teamId, game.opponentId].sort().join("-")}`;
      if (seenGameKeys.has(key)) continue;
      seenGameKeys.add(key);

      const homeEloDiff = priorScoringDifferential(teamId, game.date) - priorScoringDifferential(game.opponentId, game.date);
      eloDiffs.push(homeEloDiff);
      outcomes.push(game.teamScore > game.opponentScore ? 1 : 0);
    }
  }

  console.error(`${eloDiffs.length} completed games with pre-game history.`);

  const { intercept, weight } = fitLogisticRegression(eloDiffs, outcomes);

  let correct = 0;
  for (let i = 0; i < eloDiffs.length; i++) {
    const predicted = sigmoid(intercept + weight * eloDiffs[i]) >= 0.5 ? 1 : 0;
    if (predicted === outcomes[i]) correct++;
  }
  const accuracy = correct / eloDiffs.length;

  console.log(
    JSON.stringify(
      {
        gamesUsed: eloDiffs.length,
        intercept: Number(intercept.toFixed(4)),
        eloDiffWeight: Number(weight.toFixed(4)),
        inSampleAccuracy: Number(accuracy.toFixed(4)),
      },
      null,
      2,
    ),
  );
}

main();
