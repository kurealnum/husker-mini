# ESPN Analytics Formulas

Formulas for exactly the fields shown on `/predictions/{id}` (`src/app/predictions/[id]/page.tsx`),
i.e. the structured columns on `technical_analyses` populated by `assembleFeaturesStage`
(`src/pipeline/assemble-features.ts`). The full raw feature tree is also stored in that row's
`espn_analytics` jsonb column but isn't rendered — not covered here.

Notation: a team's completed-game log is `games = [g1, ..., gn]` (chronological), where each
`g` has `teamScore`, `opponentScore`, `won`, `isHome`, `date`, `opponentId`.

---

## Technical analysis section

- **Team scores / Game progress / k**: inputs to the formula below, taken directly from the
  live game state (not ESPN-analytics-derived).
- **Probability** (`src/lib/technical-formula.ts`):

  ```
  f(S) = 1 / (1 + e^(-k * S * ((T1 - T2) / (T1 + T2))))
  ```

  `S` = game progress `[0, 1]` (may exceed 1 in overtime), `T1`/`T2` = current score, `k` =
  steepness constant. `T1 = T2 = 0` is treated as a coin flip (`0.5`).

## ESPN analytics section

**Team 1/2 strength** (`team{1,2}OpponentAdjustedStrength`, from
`src/lib/analytics/team-strength.ts`) — SRS-style, single-pass approximation:

```
scoringDifferential(games) = mean(teamScore - opponentScore)
opponentAdjustedStrength   = scoringDifferential(games)
                            + mean(opponentDifferentials[g.opponentId] for g in games)
```

where `opponentDifferentials[teamId]` is that opponent's own `scoringDifferential` (from the
two teams in this matchup — not the full league). `0` if the team has no completed games.

**Team 1/2 availability risk** (`team{1,2}AvailabilityRisk`, from
`src/lib/analytics/player-availability.ts`) — `true` if any reported injury's athlete id is
in the team's inferred-starters set. Starters are inferred heuristically: within each roster
position group, the first-listed athlete is treated as the starter.

**Team 1/2 lost production** (`team{1,2}LostProduction`) — sum, across all injured players,
of:

```
severityWeight = { out: 1.0, doubtful: 0.75, questionable: 0.5, unknown: 0.5, probable: 0.15 }
avgProduction  = mean(statKey across that player's last 5 gamelog entries)   [0 if no gamelog]
estimatedLostProduction = avgProduction * severityWeight(severity)
```

`statKey` is the sport's production stat: `yards` (nfl/ncaaf), `points` (nba/ncaab/nhl),
`hits` (mlb). `severity` is the injury's free-text status classified by substring match
(`"out"`/`"injured reserve"`/`"ir"` → `out`, else matched against
`doubtful`/`questionable`/`probable`, else `unknown`).

**Composite edge** (`compositeEdge`, from `src/lib/analytics/matchup.ts`):

```
compositeEdge = team1.opponentAdjustedStrength - team2.opponentAdjustedStrength
```

Positive favors team 1.

**Market spread / total / moneyline (home, away)** (`marketSpread`, `marketTotal`,
`marketMoneylineHome`, `marketMoneylineAway`, from `src/lib/analytics/market.ts`) — read
verbatim off a single odds entry for the event (`spread`, `overUnder`,
`homeTeamOdds.moneyLine`, `awayTeamOdds.moneyLine`). Picks `preferredProviderId` if
configured and present, otherwise whichever sportsbook ESPN lists first. All four are `null`
if ESPN has no odds for the event — common for lower-profile games, and confirmed via live
traffic to be a genuine "no data", not a broken request.
