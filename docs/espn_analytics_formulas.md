# ESPN Analytics Formulas

Formulas for every field in `GameFeatures` (`src/pipeline/assemble-features.ts`), computed
from ESPN data by the modules in `src/lib/analytics/`. Notation: a team's completed-game log
is `games = [g1, g2, ..., gn]` in chronological order, where each `g` has `teamScore`,
`opponentScore`, `won`, `isHome`, `date`, `opponentId`.

---

## Team strength (`src/lib/analytics/team-strength.ts`)

- **winRate** = `count(g.won) / n` over all completed games. `0` if `n = 0`.
- **recentWinRate** = same formula, restricted to the last 5 games (`games.slice(-5)`).
- **scoringDifferential** = `mean(teamScore - opponentScore)` over all games — average
  margin of victory/defeat.
- **homeWinRate** / **awayWinRate** = `winRate` restricted to games where `isHome` matches;
  `null` if the team has no games of that split.
- **opponentAdjustedStrength** (SRS-style, single-pass approximation):

  ```
  opponentAdjustedStrength = scoringDifferential(games)
                            + mean(opponentDifferentials[g.opponentId] for g in games)
  ```

  where `opponentDifferentials[teamId] = scoringDifferential` of that opponent's own game
  log (from the same `allTeamGames` map — currently only the two teams in this matchup, not
  the full league). Interpretation: raw scoring margin, adjusted up/down by how strong the
  opponents faced were.

## Recent form (`src/lib/analytics/recent-form.ts`)

- **last5** / **last10**: `{ gamesPlayed, wins, losses, winRate, avgScoringMargin }` computed
  identically to team strength's `winRate`/`scoringDifferential`, just windowed to the last 5
  or 10 games (`games.slice(-5)` / `slice(-10)`).
- **scoringTrend**: least-squares linear regression slope of scoring margin vs. game index,
  over the last 10 games:

  ```
  margins[i] = teamScore[i] - opponentScore[i]     for i = 0..9 (chronological)
  slope = Σ((i - mean(i)) * (margins[i] - mean(margins))) / Σ((i - mean(i))²)
  ```

  Positive = margins trending up (improving) over the window; `0` if fewer than 2 games.
- **volatility**: population standard deviation of scoring margin over the last 10 games —
  `sqrt(mean((margin - mean(margins))²))`. Higher = more inconsistent game-to-game results.

## Player strength (`src/lib/analytics/player-strength.ts`)

Applied to each starter's gamelog entries (`entries[i].stats[statKey]`), for the sport's
`PRODUCTION_STAT_KEY` (nfl/ncaaf: `yards`, nba/ncaab: `points`, nhl: `points`, mlb: `hits`).

- **playerStrength.aggregate** = `{ total, average }` — `total` = sum of `statKey` across
  every rostered starter's every logged game; `average` = that same stat's per-game mean
  across all starters' games pooled together (not per-player).
- **playerStrength.top** = the 5 starters with the highest per-player average of `statKey`
  (`mean(entries[*].stats[statKey])`), descending.
- **playerStrength.recentForm** = each starter's average of `statKey` over their last 5
  logged games (`entries.slice(-5)`).

## Player availability (`src/lib/analytics/player-availability.ts`)

For each reported injury with a resolved athlete:

- **severity** = free-text status classified into a bucket via substring match:
  `out` (or "injured reserve"/"ir") → `out`, else `doubtful`/`questionable`/`probable` by
  matching those words, else `unknown`.
- **severityWeight**: fixed lookup — `out = 1.0`, `doubtful = 0.75`, `questionable = 0.5`,
  `unknown = 0.5`, `probable = 0.15`. Interpretation: likelihood the player actually misses
  the game.
- **estimatedLostProduction** (per injured player) =

  ```
  avgProduction = mean(statKey across that player's last 5 gamelog entries)   [0 if no gamelog]
  estimatedLostProduction = avgProduction * severityWeight(severity)
  ```

- **totalEstimatedLostProduction** (team-wide) = `Σ estimatedLostProduction` across all
  injured players — this feeds the `team{1,2}LostProduction` columns.
- **hasStarterAvailabilityRisk** = `true` if any injured player's athlete id is in the
  inferred-starters set (`team{1,2}AvailabilityRisk` columns).
- **inferStarterIds**: heuristic — within each roster position group, the first-listed
  athlete is treated as the starter (ESPN doesn't expose an explicit starter flag).

## Matchup (`src/lib/analytics/matchup.ts`)

Let `split(games) = { avgPointsFor: mean(teamScore), avgPointsAgainst: mean(opponentScore) }`
for a team's game log, and `projected(offense, opponentDefense) = (offense.avgPointsFor +
opponentDefense.avgPointsAgainst) / 2` (a midpoint projection, not a regression model).

- **compositeEdge** = `teamAStrength.opponentAdjustedStrength - teamBStrength.opponentAdjustedStrength`
  (positive favors team 1) — this is the `compositeEdge` column.
- **teamAOffensiveMatchup** = `projected(splitA, splitB)` — team A's projected scoring vs.
  team B's defense.
- **teamBOffensiveMatchup** = `projected(splitB, splitA)`.
- **teamADefensiveMatchup** = `projected(splitB, splitA)` (team A's projected points allowed,
  facing team B's offense — same formula as teamBOffensiveMatchup, read from the other side).
- **teamBDefensiveMatchup** = `projected(splitA, splitB)`.

## Game context (`src/lib/analytics/game-context.ts`)

- **homeAway** = `"home"` or `"away"`, taken directly from the resolved game.
- **restDays** = days between `gameDate` and the team's most recent completed game strictly
  before it: `round((gameDate - lastGameDate) / 86_400_000)`. `null` if no prior game.
- **seasonStage** = `"playoffs"` if `gameDate >= playoffStartDate` (when configured), else the
  regular season span `[seasonStart, seasonEnd]` is divided into three equal thirds by
  elapsed fraction: `< 1/3` → `early`, `< 2/3` → `mid`, else `late`. `null` entirely if
  `SEASON_START_DATE`/`SEASON_END_DATE` aren't configured.
- **recentTransactions** = league transactions for this team where
  `gameDate - 14 days <= transaction.date <= gameDate`.

## Market snapshot (`src/lib/analytics/market.ts`)

Picked from ESPN's odds `items[]` for the event (one entry per sportsbook):

- Prefers `preferredProviderId` if configured and present; otherwise takes `items[0]`
  (whichever book ESPN lists first — usually the highest-priority provider).
- **moneylineHome** / **moneylineAway** = that entry's `homeTeamOdds.moneyLine` /
  `awayTeamOdds.moneyLine`, verbatim.
- **spread** = that entry's `spread`, verbatim (favorite's line, negative = favored).
- **total** = that entry's `overUnder`, verbatim.
- **capturedAt** = wall-clock time of the fetch (not from ESPN — this is a single on-demand
  snapshot, not tracked movement; see the module-level comment in `assemble-features.ts`).
- All four fields are `null` if ESPN has no odds for the event (common — sportsbooks don't
  always post lines for every game, especially low-profile ones. Confirmed via live traffic
  that this is a real 404, not a wrong URL).

## Technical formula (separate from ESPN — `src/lib/technical-formula.ts`)

Not ESPN-derived, but stored alongside in the same `technical_analyses` row:

```
f(S) = 1 / (1 + e^(-k * S * ((T1 - T2) / (T1 + T2))))
```

`S` = game progress `[0, 1]` (may exceed 1 in overtime), `T1`/`T2` = current score, `k` =
steepness constant. `T1 = T2 = 0` (no scoring yet) is treated as a coin flip (`0.5`) rather
than dividing by zero.
