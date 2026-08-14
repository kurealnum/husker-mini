/**
 * Fits and backtests a three-outcome (home win / away win / draw)
 * win-probability model against real, completed EPL games. For each team,
 * walks its schedule chronologically and computes each game's pre-game
 * "eloDiff" feature from only the scoring differential of games strictly
 * before it (no future-game leakage), then fits a multinomial logistic
 * regression (draw as the reference class) via gradient descent and
 * reports in-sample accuracy (correct = highest-probability outcome
 * matches the actual result, including draws).
 *
 * Run with: npx tsx scripts/backtest-soccer-model.ts
 */

export {};

const SITE_API_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1";

/** The most recent fully-completed EPL season, used since the current season has too few played games to fit against. */
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

/** Softmax over [homeUtility, awayUtility, drawUtility=0 (reference class)]. */
function threeWayProbabilities(homeUtility: number, awayUtility: number): [number, number, number] {
  const expHome = Math.exp(homeUtility);
  const expAway = Math.exp(awayUtility);
  const expDraw = 1; // reference class utility fixed at 0
  const total = expHome + expAway + expDraw;
  return [expHome / total, expAway / total, expDraw / total];
}

/**
 * Fits a 3-class multinomial logit with draw as the reference class:
 *   U_home = aHome + bHome * eloDiff
 *   U_away = aAway + bAway * eloDiff
 *   U_draw = 0
 * via batch gradient descent on the multinomial log-likelihood.
 */
function fitMultinomialLogit(
  eloDiffs: number[],
  outcomes: Array<"home" | "away" | "draw">,
  iterations = 3000,
  learningRate = 0.05,
): { aHome: number; bHome: number; aAway: number; bAway: number } {
  let aHome = 0;
  let bHome = 0;
  let aAway = 0;
  let bAway = 0;
  const n = eloDiffs.length;

  for (let iter = 0; iter < iterations; iter++) {
    let gradAHome = 0;
    let gradBHome = 0;
    let gradAAway = 0;
    let gradBAway = 0;

    for (let i = 0; i < n; i++) {
      const x = eloDiffs[i];
      const [pHome, pAway] = threeWayProbabilities(aHome + bHome * x, aAway + bAway * x);
      const yHome = outcomes[i] === "home" ? 1 : 0;
      const yAway = outcomes[i] === "away" ? 1 : 0;

      const errHome = pHome - yHome;
      const errAway = pAway - yAway;

      gradAHome += errHome;
      gradBHome += errHome * x;
      gradAAway += errAway;
      gradBAway += errAway * x;
    }

    aHome -= (learningRate * gradAHome) / n;
    bHome -= (learningRate * gradBHome) / n;
    aAway -= (learningRate * gradAAway) / n;
    bAway -= (learningRate * gradBAway) / n;
  }

  return { aHome, bHome, aAway, bAway };
}

async function main() {
  console.error("Fetching EPL team ids...");
  const teamIds = await fetchTeamIds();
  console.error(`${teamIds.length} teams.`);

  const gamesByTeam = new Map<string, Game[]>();
  for (const teamId of teamIds) {
    gamesByTeam.set(teamId, await fetchTeamGames(teamId));
    await sleep(260);
  }

  function priorScoringDifferential(teamId: string, beforeDate: string): number {
    const games = (gamesByTeam.get(teamId) ?? []).filter((g) => g.date < beforeDate);
    if (games.length === 0) return 0;
    const total = games.reduce((sum, g) => sum + (g.teamScore - g.opponentScore), 0);
    return total / games.length;
  }

  const eloDiffs: number[] = [];
  const outcomes: Array<"home" | "away" | "draw"> = [];
  const seenGameKeys = new Set<string>();

  for (const [teamId, games] of gamesByTeam) {
    for (const game of games) {
      if (!game.isHome) continue;
      const key = `${game.date}:${[teamId, game.opponentId].sort().join("-")}`;
      if (seenGameKeys.has(key)) continue;
      seenGameKeys.add(key);

      const homeEloDiff =
        priorScoringDifferential(teamId, game.date) - priorScoringDifferential(game.opponentId, game.date);
      eloDiffs.push(homeEloDiff);
      outcomes.push(
        game.teamScore > game.opponentScore ? "home" : game.teamScore < game.opponentScore ? "away" : "draw",
      );
    }
  }

  console.error(`${eloDiffs.length} completed games with pre-game history.`);
  const outcomeCounts = { home: 0, away: 0, draw: 0 };
  outcomes.forEach((o) => outcomeCounts[o]++);
  console.error("Outcome distribution:", outcomeCounts);

  const fit = fitMultinomialLogit(eloDiffs, outcomes);

  let correct = 0;
  for (let i = 0; i < eloDiffs.length; i++) {
    const [pHome, pAway, pDraw] = threeWayProbabilities(
      fit.aHome + fit.bHome * eloDiffs[i],
      fit.aAway + fit.bAway * eloDiffs[i],
    );
    const predicted = pHome >= pAway && pHome >= pDraw ? "home" : pAway >= pDraw ? "away" : "draw";
    if (predicted === outcomes[i]) correct++;
  }
  const accuracy = correct / eloDiffs.length;

  console.log(
    JSON.stringify(
      {
        gamesUsed: eloDiffs.length,
        outcomeCounts,
        aHome: Number(fit.aHome.toFixed(4)),
        bHome: Number(fit.bHome.toFixed(4)),
        aAway: Number(fit.aAway.toFixed(4)),
        bAway: Number(fit.bAway.toFixed(4)),
        inSampleAccuracy: Number(accuracy.toFixed(4)),
      },
      null,
      2,
    ),
  );
}

main();
