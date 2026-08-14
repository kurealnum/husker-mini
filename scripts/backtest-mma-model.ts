/**
 * Fits and backtests the MMA win-probability model against real,
 * completed UFC fights. The only feature available is each fighter's
 * career record (`records[].summary`, e.g. "13-4-1"), which ESPN's
 * scoreboard returns **as of now** — for a completed historical fight,
 * that record already includes the fight's own result. This is a real,
 * documented simplification (same category as the tennis backtest's
 * current-rankings proxy): the record used is "as of query time," not
 * "entering that specific fight." Treat this as a first-cut sanity check.
 *
 * Run with: npx tsx scripts/backtest-mma-model.ts
 */

export {};

const SITE_API_BASE = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc";

interface EspnRecord {
  type: string;
  summary: string;
}

interface EspnCompetitor {
  winner?: boolean;
  athlete?: { displayName: string };
  records?: EspnRecord[];
}

interface EspnCompetition {
  status: { type: { completed: boolean } };
  competitors: EspnCompetitor[];
}

interface EspnEvent {
  competitions: EspnCompetition[];
}

/** Parses "W-L-D" into a win rate (draws counted as half a win). */
function winRate(summary: string | undefined): number | null {
  if (!summary) return null;
  const parts = summary.split("-").map(Number);
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  const [wins, losses, draws = 0] = parts;
  const total = wins + losses + draws;
  if (total === 0) return null;
  return (wins + draws * 0.5) / total;
}

async function fetchCompletedFights(dateRange: string): Promise<
  Array<{ p1WinRate: number; p2WinRate: number; p1Won: boolean }>
> {
  const response = await fetch(`${SITE_API_BASE}/scoreboard?dates=${dateRange}`);
  const data = (await response.json()) as { events: EspnEvent[] };
  const fights: Array<{ p1WinRate: number; p2WinRate: number; p1Won: boolean }> = [];

  for (const event of data.events) {
    for (const competition of event.competitions ?? []) {
      if (!competition.status.type.completed) continue;
      const [p1, p2] = competition.competitors ?? [];
      if (!p1?.athlete || !p2?.athlete) continue;
      if (p1.winner === p2.winner) continue; // draw/no-contest — no clean winner signal

      const p1WinRate = winRate(p1.records?.find((r) => r.type === "total")?.summary);
      const p2WinRate = winRate(p2.records?.find((r) => r.type === "total")?.summary);
      if (p1WinRate == null || p2WinRate == null) continue;

      fights.push({ p1WinRate, p2WinRate, p1Won: p1.winner === true });
    }
  }

  return fights;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function fitLogisticRegression(
  x: number[],
  y: number[],
  iterations = 3000,
  learningRate = 0.1,
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
  console.error("Fetching completed UFC fights (2025)...");
  const ranges = ["20250101-20250228", "20250301-20250430", "20250501-20250630"];
  const fights = (await Promise.all(ranges.map(fetchCompletedFights))).flat();
  console.error(`${fights.length} completed, decisive (non-draw) fights with both records available.`);

  const winRateDiffs = fights.map((f) => f.p1WinRate - f.p2WinRate);
  const outcomes = fights.map((f) => (f.p1Won ? 1 : 0));

  const { intercept, weight } = fitLogisticRegression(winRateDiffs, outcomes);

  let correct = 0;
  for (let i = 0; i < winRateDiffs.length; i++) {
    const predicted = sigmoid(intercept + weight * winRateDiffs[i]) >= 0.5 ? 1 : 0;
    if (predicted === outcomes[i]) correct++;
  }
  const accuracy = fights.length > 0 ? correct / fights.length : 0;

  console.log(
    JSON.stringify(
      {
        fightsUsed: fights.length,
        intercept: Number(intercept.toFixed(4)),
        winRateDiffWeight: Number(weight.toFixed(4)),
        inSampleAccuracy: Number(accuracy.toFixed(4)),
      },
      null,
      2,
    ),
  );
}

main();
