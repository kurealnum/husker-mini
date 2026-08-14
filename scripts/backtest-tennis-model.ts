/**
 * Fits and backtests the tennis win-probability model against real,
 * completed ATP matches. Uses **current** ATP rankings as a static proxy
 * for each match's pre-match ranking — ESPN doesn't expose historical
 * ranking snapshots, and reconstructing them from weekly ranking-history
 * endpoints is out of scope for this backtest. This is a real, documented
 * simplification: a player's ranking drifts over the season, so a match
 * from January is being judged against an August ranking. The fitted
 * coefficient and accuracy below reflect that noise; treat this as a
 * first-cut sanity check, not a precise fit.
 *
 * Run with: npx tsx scripts/backtest-tennis-model.ts
 */

export {};

const SITE_API_BASE = "https://site.api.espn.com/apis/site/v2/sports/tennis/atp";

interface EspnLinescore {
  value: number;
  winner?: boolean;
}

interface EspnCompetitor {
  athlete: { displayName: string };
  linescores?: EspnLinescore[];
}

interface EspnCompetition {
  status: { type: { completed: boolean } };
  competitors: EspnCompetitor[];
}

interface EspnEvent {
  groupings?: Array<{ competitions: EspnCompetition[] }>;
}

interface EspnRankingsResponse {
  rankings: Array<{ ranks: Array<{ current: number; athlete: { displayName: string } }> }>;
}

async function fetchCurrentRankings(): Promise<Map<string, number>> {
  const response = await fetch(`${SITE_API_BASE}/rankings`);
  const data = (await response.json()) as EspnRankingsResponse;
  const ranks = data.rankings?.[0]?.ranks ?? [];
  return new Map(ranks.map((r) => [r.athlete.displayName.toLowerCase(), r.current]));
}

async function fetchCompletedMatches(dateRange: string): Promise<Array<{ p1: string; p2: string; p1Won: boolean }>> {
  const response = await fetch(`${SITE_API_BASE}/scoreboard?dates=${dateRange}`);
  const data = (await response.json()) as { events: EspnEvent[] };
  const matches: Array<{ p1: string; p2: string; p1Won: boolean }> = [];

  for (const event of data.events) {
    for (const grouping of event.groupings ?? []) {
      for (const competition of grouping.competitions) {
        if (!competition.status.type.completed) continue;
        const [p1, p2] = competition.competitors ?? [];
        if (!p1?.athlete?.displayName || !p2?.athlete?.displayName) continue; // skip doubles/byes with no singles athlete
        const p1SetsWon = (p1.linescores ?? []).filter((l) => l.winner).length;
        const p2SetsWon = (p2.linescores ?? []).filter((l) => l.winner).length;
        if (p1SetsWon === p2SetsWon) continue; // no data on which side actually won
        matches.push({ p1: p1.athlete.displayName, p2: p2.athlete.displayName, p1Won: p1SetsWon > p2SetsWon });
      }
    }
  }

  return matches;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Fits P(y=1) = sigmoid(intercept + weight * x) via batch gradient descent. */
function fitLogisticRegression(
  x: number[],
  y: number[],
  iterations = 2000,
  learningRate = 0.01,
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
  console.error("Fetching current ATP rankings...");
  const rankings = await fetchCurrentRankings();
  console.error(`${rankings.size} ranked players.`);

  console.error("Fetching completed ATP matches (Jan 2025)...");
  const matches = await fetchCompletedMatches("20250101-20250131");
  console.error(`${matches.length} completed matches.`);

  // rankDiff = p1's rank minus p2's rank (higher number = worse ranking),
  // so a NEGATIVE rankDiff means p1 is better-ranked. Only matches where
  // both players are found in the current top ranks are usable.
  const rankDiffs: number[] = [];
  const outcomes: number[] = [];

  for (const match of matches) {
    const p1Rank = rankings.get(match.p1.toLowerCase());
    const p2Rank = rankings.get(match.p2.toLowerCase());
    if (p1Rank == null || p2Rank == null) continue;
    rankDiffs.push(p2Rank - p1Rank); // positive = p1 better-ranked
    outcomes.push(match.p1Won ? 1 : 0);
  }

  console.error(`${rankDiffs.length} matches with both players ranked.`);

  const { intercept, weight } = fitLogisticRegression(rankDiffs, outcomes);

  let correct = 0;
  for (let i = 0; i < rankDiffs.length; i++) {
    const predicted = sigmoid(intercept + weight * rankDiffs[i]) >= 0.5 ? 1 : 0;
    if (predicted === outcomes[i]) correct++;
  }
  const accuracy = rankDiffs.length > 0 ? correct / rankDiffs.length : 0;

  console.log(
    JSON.stringify(
      {
        matchesUsed: rankDiffs.length,
        intercept: Number(intercept.toFixed(4)),
        rankDiffWeight: Number(weight.toFixed(6)),
        inSampleAccuracy: Number(accuracy.toFixed(4)),
      },
      null,
      2,
    ),
  );
}

main();
