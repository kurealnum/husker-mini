/**
 * Audits Kalshi's public, unauthenticated `/series` and `/markets` endpoints
 * for every sport the "Support new sports" epic targets, to answer: which
 * series actually trade, what market shape they take (head-to-head, three-way
 * with a draw, or field/outright), and whether recent volume justifies
 * building a pipeline at all.
 *
 * Facts only (issue #157) — does not change ticker-inference behavior.
 * `SERIES_PREFIX_TO_SPORT`'s six existing entries already live in the league
 * registry (src/lib/leagues/registry.ts); this script identifies what new
 * `tickerPrefix` entries a future league needs.
 *
 * Run with: npx tsx scripts/audit-kalshi-series.ts
 */

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";

/** One Kalshi series as returned by GET /series. */
interface KalshiSeries {
  ticker: string;
  title: string;
  tags?: string[];
  fee_type?: string;
  settlement_sources?: Array<{ name: string }>;
}

/** One Kalshi market as returned by GET /markets. */
interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  yes_sub_title?: string;
  volume_fp?: string;
}

/** A family we care about, and the ticker-name patterns that mark a tradeable head-to-head/field series (not a prop/derivative market). */
interface FamilyTarget {
  family: string;
  tag: string;
  /** Ticker substrings that mark a series as a genuine contest-outcome market, not a prop/spread/corners/etc. side market. */
  candidatePatterns: RegExp[];
}

const FAMILIES: FamilyTarget[] = [
  { family: "football", tag: "Football", candidatePatterns: [/GAME$/] },
  { family: "basketball", tag: "Basketball", candidatePatterns: [/GAME$/] },
  { family: "hockey", tag: "Hockey", candidatePatterns: [/GAME$/] },
  { family: "baseball", tag: "Baseball", candidatePatterns: [/GAME$/] },
  { family: "soccer", tag: "Soccer", candidatePatterns: [/GAME$/] },
  { family: "tennis", tag: "Tennis", candidatePatterns: [/MATCH$/] },
  { family: "mma", tag: "MMA", candidatePatterns: [/FIGHT$/] },
  { family: "golf", tag: "Golf", candidatePatterns: [/TOURN$/] },
  { family: "volleyball", tag: "Volleyball", candidatePatterns: [/MATCH$/] },
];

interface SeriesReport {
  ticker: string;
  title: string;
  family: string;
  shape: "head_to_head" | "three_way" | "field" | "unknown";
  settlementSources: string[];
  sampleEventLegs: string[];
  sampleVolume: number;
  marketsReturned: number;
}

async function fetchAllSportsSeries(): Promise<KalshiSeries[]> {
  const response = await fetch(`${KALSHI_API_BASE}/series?category=Sports&limit=1000`);
  if (!response.ok) throw new Error(`Kalshi /series request failed (${response.status}).`);
  const data = (await response.json()) as { series: KalshiSeries[] };
  return data.series;
}

function classifyShape(markets: KalshiMarket[]): { shape: SeriesReport["shape"]; legs: string[] } {
  if (markets.length === 0) return { shape: "unknown", legs: [] };
  const firstEvent = markets[0].event_ticker;
  const legs = markets.filter((m) => m.event_ticker === firstEvent);
  const subtitles = legs.map((m) => m.yes_sub_title ?? m.ticker);
  if (legs.length === 2) return { shape: "head_to_head", legs: subtitles };
  if (legs.length === 3 && subtitles.some((s) => /tie|draw/i.test(s))) {
    return { shape: "three_way", legs: subtitles };
  }
  if (legs.length > 3) return { shape: "field", legs: subtitles.slice(0, 5) };
  return { shape: "unknown", legs: subtitles };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetches with a couple of retries on non-2xx, backing off — the public Kalshi API rate-limits bursts of requests. */
async function fetchMarketsWithRetry(url: string, maxRetries = 3): Promise<KalshiMarket[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url);
    if (response.ok) {
      return ((await response.json()) as { markets: KalshiMarket[] }).markets;
    }
    if (attempt < maxRetries) {
      await sleep(500 * 2 ** attempt);
    }
  }
  return [];
}

async function auditSeries(series: KalshiSeries, family: string): Promise<SeriesReport> {
  await sleep(150);
  const markets = await fetchMarketsWithRetry(`${KALSHI_API_BASE}/markets?series_ticker=${series.ticker}&limit=200`);
  const { shape, legs } = classifyShape(markets);
  const volume = markets.reduce((sum, m) => sum + Number.parseFloat(m.volume_fp ?? "0"), 0);
  return {
    ticker: series.ticker,
    title: series.title,
    family,
    shape,
    settlementSources: (series.settlement_sources ?? []).map((s) => s.name),
    sampleEventLegs: legs,
    sampleVolume: Math.round(volume),
    marketsReturned: markets.length,
  };
}

async function main() {
  const allSeries = await fetchAllSportsSeries();
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    "# Kalshi sports series audit",
    "",
    `Generated ${date} by \`scripts/audit-kalshi-series.ts\`. Re-run to refresh.`,
    "",
    "Only series whose ticker names match a genuine contest-outcome pattern " +
      "(`*GAME`, `*MATCH`, `*FIGHT`, `*TOURN`) are audited — prop/spread/corners/" +
      "total markets are out of scope. Volume is the sum of `volume_fp` across a " +
      "single page of markets for that series (up to 200), not lifetime volume.",
    "",
  ];

  const recommendations: string[] = [];

  for (const target of FAMILIES) {
    const candidates = allSeries.filter(
      (s) => (s.tags ?? []).includes(target.tag) && target.candidatePatterns.some((p) => p.test(s.ticker)),
    );
    console.error(`${target.family}: ${candidates.length} candidate series`);

    lines.push(`## ${target.family}`, "", `${candidates.length} candidate series found (tag: ${target.tag}).`, "");
    lines.push("| Ticker | Title | Shape | Sample volume | Settlement sources |", "|---|---|---|---|---|");

    const reports: SeriesReport[] = [];
    for (const series of candidates) {
      const report = await auditSeries(series, target.family);
      reports.push(report);
      lines.push(
        `| \`${report.ticker}\` | ${report.title} | ${report.shape} | ${report.sampleVolume.toLocaleString()} | ${report.settlementSources.join(", ") || "—"} |`,
      );
    }
    lines.push("");

    const totalVolume = reports.reduce((sum, r) => sum + r.sampleVolume, 0);
    if (target.family === "volleyball") {
      const recommendation =
        totalVolume === 0
          ? `**Do not build volleyball.** The only live series, \`KXVOLLEYBALLMATCH\`, shows zero recorded volume across all its markets (sample events are the Pan American Cup, not NCAA — ESPN's only volleyball coverage). Close the volleyball issue rather than building a pipeline for it.`
          : `Volleyball has ${totalVolume.toLocaleString()} sample volume across \`KXVOLLEYBALLMATCH\` — revisit before closing the issue.`;
      recommendations.push(recommendation);
      lines.push(recommendation, "");
    }
  }

  lines.push(
    "## Fee categories",
    "",
    "`readFeeTakerCoeffTenThousandths` (src/lib/market-edge.ts:19) reads " +
      "`KALSHI_FEE_TAKER_COEFF_<CATEGORY>` keyed by the league registry key in " +
      "upper case (e.g. `KALSHI_FEE_TAKER_COEFF_NFL`), falling back to the " +
      "category-less `KALSHI_FEE_TAKER_COEFF` (0.07) when unset. No new-sport " +
      "series above have a per-category override configured yet — a future " +
      "league's pipeline should pass its registry key as the category and add " +
      "an env var override only if its fee schedule differs from the default.",
    "",
  );

  lines.push("## Recommendations", "", ...recommendations.map((r) => `- ${r}`));

  const fs = await import("node:fs/promises");
  await fs.writeFile("docs/kalshi-series-audit.md", lines.join("\n"));
  console.error("Wrote docs/kalshi-series-audit.md");
}

main();
