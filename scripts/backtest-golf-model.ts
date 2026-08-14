/**
 * Fits and backtests the golf field win-probability model against real,
 * completed PGA tournaments. For each tournament, reconstructs every
 * player's cumulative score-relative-to-par after each round (from their
 * per-round `linescores[].displayValue`, which is that round's own score
 * relative to par — cumulative-through-round-N is the sum of rounds 1..N),
 * computes their strokes-behind-the-round-leader at that checkpoint, and
 * labels whether they were the eventual tournament winner. Pools
 * (strokesBehindLeader, wonTournament) pairs across every round of every
 * player in every tournament and fits a single-parameter softmax-style
 * logistic model via gradient descent.
 *
 * No world ranking, recent-finish, or course-history data is used — ESPN
 * exposes no working world-ranking endpoint for golf (`/rankings` 404s at
 * both the sport and tour level, confirmed live), so live tournament
 * position relative to the field is the only real signal available.
 *
 * Run with: npx tsx scripts/backtest-golf-model.ts
 */

export {};

const SITE_API_BASE = "https://site.api.espn.com/apis/site/v2/sports/golf/pga";

interface EspnLinescore {
  period: number;
  displayValue?: string;
}

interface EspnCompetitor {
  order?: number;
  athlete?: { displayName: string };
  linescores?: EspnLinescore[];
}

interface EspnCompetition {
  status: { type: { completed: boolean } };
  competitors: EspnCompetitor[];
}

interface EspnEvent {
  competitions: EspnCompetition[];
}

/** Parses a relative-to-par display value like "-6", "E", "+2" into a signed number (E = even par = 0). */
function parseRelativeToPar(displayValue: string | undefined): number | null {
  if (displayValue == null) return null;
  if (displayValue === "E") return 0;
  const value = Number.parseInt(displayValue, 10);
  return Number.isNaN(value) ? null : value;
}

async function fetchCompletedTournament(dateRange: string): Promise<EspnCompetition | null> {
  const response = await fetch(`${SITE_API_BASE}/scoreboard?dates=${dateRange}`);
  const data = (await response.json()) as { events: EspnEvent[] };
  const event = data.events.find((e) => e.competitions[0]?.status.type.completed);
  return event?.competitions[0] ?? null;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function fitLogisticRegression(x: number[], y: number[], iterations = 3000, learningRate = 0.05) {
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
  // A handful of completed 2025 PGA Tour events, spread across the season.
  const dateRanges = [
    "20250116-20250120",
    "20250213-20250217",
    "20250313-20250317",
    "20250417-20250421",
    "20250515-20250519",
    "20250619-20250623",
  ];

  console.error("Fetching completed PGA tournaments...");
  const tournaments = (await Promise.all(dateRanges.map(fetchCompletedTournament))).filter(
    (t): t is EspnCompetition => t != null,
  );
  console.error(`${tournaments.length} completed tournaments found.`);

  const strokesBehind: number[] = [];
  const wonTournament: number[] = [];

  for (const competition of tournaments) {
    const winner = competition.competitors.find((c) => c.order === 1);
    if (!winner) continue;

    for (const roundNum of [1, 2, 3, 4]) {
      const cumulative = new Map<string, number>();
      for (const competitor of competition.competitors) {
        if (!competitor.athlete?.displayName) continue;
        let sum = 0;
        let hasAllRounds = true;
        for (let r = 1; r <= roundNum; r++) {
          const roundScore = parseRelativeToPar(
            competitor.linescores?.find((l) => l.period === r)?.displayValue,
          );
          if (roundScore == null) {
            hasAllRounds = false;
            break;
          }
          sum += roundScore;
        }
        if (hasAllRounds) cumulative.set(competitor.athlete.displayName, sum);
      }
      if (cumulative.size === 0) continue;

      const leaderScore = Math.min(...cumulative.values());
      for (const [name, score] of cumulative) {
        strokesBehind.push(score - leaderScore);
        wonTournament.push(name === winner.athlete?.displayName ? 1 : 0);
      }
    }
  }

  console.error(`${strokesBehind.length} (player, round-checkpoint) samples.`);

  // Feature is strokes BEHIND leader (>= 0); negate so a smaller gap -> higher logit.
  const x = strokesBehind.map((s) => -s);
  const { intercept, weight } = fitLogisticRegression(x, wonTournament);

  let correct = 0;
  for (let i = 0; i < x.length; i++) {
    const predicted = sigmoid(intercept + weight * x[i]) >= 0.5 ? 1 : 0;
    if (predicted === wonTournament[i]) correct++;
  }
  const accuracy = x.length > 0 ? correct / x.length : 0;

  console.log(
    JSON.stringify(
      {
        tournamentsUsed: tournaments.length,
        samplesUsed: x.length,
        intercept: Number(intercept.toFixed(4)),
        strokesBehindWeight: Number(weight.toFixed(4)),
        inSampleAccuracy: Number(accuracy.toFixed(4)),
      },
      null,
      2,
    ),
  );
}

main();
