# ESPN endpoint availability audit

Generated 2026-08-14 by `scripts/audit-espn-endpoints.ts`. Re-run to refresh.

Legend: ✅ usable, ❌ not usable (404/500/empty/error). One sample team and athlete id is discovered per league via the teams/roster endpoints, so a ❌ on a team- or athlete-scoped endpoint reflects that specific sample, not necessarily every team.

## nfl

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ✅ 200 |
| team schedule | ✅ 200 |
| team injuries | ✅ 200 |
| athlete gamelog | ✅ 200 |
| athlete stats | ❌ 404 |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |

## college-football

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ✅ 200 |
| team schedule | ❌ 200 (200 but empty/unusable payload) |
| team injuries | ✅ 200 |
| athlete gamelog | ✅ 200 |
| athlete stats | ❌ 404 |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |

## nba

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ✅ 200 |
| team schedule | ✅ 200 |
| team injuries | ✅ 200 |
| athlete gamelog | ✅ 200 |
| athlete stats | ❌ 404 |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |

## mens-college-basketball

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ✅ 200 |
| team schedule | ❌ 200 (200 but empty/unusable payload) |
| team injuries | ✅ 200 |
| athlete gamelog | ✅ 200 |
| athlete stats | ❌ 404 |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |

## nhl

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ✅ 200 |
| team schedule | ✅ 200 |
| team injuries | ✅ 200 |
| athlete gamelog | ✅ 200 |
| athlete stats | ❌ 404 |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |

## mlb

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ✅ 200 |
| team schedule | ✅ 200 |
| team injuries | ✅ 200 |
| athlete gamelog | ✅ 200 |
| athlete stats | ❌ 404 |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |

## eng.1

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ✅ 200 |
| team schedule | ❌ 200 (200 but empty/unusable payload) |
| team injuries | ✅ 200 |
| athlete gamelog | ❌ 500 |
| athlete stats | ❌ 404 |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |

## usa.1

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ✅ 200 |
| team schedule | ✅ 200 |
| team injuries | ✅ 200 |
| athlete gamelog | ❌ 500 |
| athlete stats | ❌ 404 |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |

## atp

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ❌ 200 (200 but empty/unusable payload) |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ❌ error (no team id discovered) |
| team schedule | ❌ error (no team id discovered) |
| team injuries | ❌ error (no team id discovered) |
| athlete gamelog | ❌ error (no team id discovered) |
| athlete stats | ❌ error (no team id discovered) |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ❌ 400 |

## wta

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ❌ 200 (200 but empty/unusable payload) |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ❌ error (no team id discovered) |
| team schedule | ❌ error (no team id discovered) |
| team injuries | ❌ error (no team id discovered) |
| athlete gamelog | ❌ error (no team id discovered) |
| athlete stats | ❌ error (no team id discovered) |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ❌ 400 |

## ufc

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ❌ 200 (200 but empty/unusable payload) |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ❌ error (no team id discovered) |
| team schedule | ❌ error (no team id discovered) |
| team injuries | ❌ error (no team id discovered) |
| athlete gamelog | ❌ error (no team id discovered) |
| athlete stats | ❌ error (no team id discovered) |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ❌ 404 |

## pga

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ❌ 200 (200 but empty/unusable payload) |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ❌ error (no team id discovered) |
| team schedule | ❌ error (no team id discovered) |
| team injuries | ❌ error (no team id discovered) |
| athlete gamelog | ❌ error (no team id discovered) |
| athlete stats | ❌ error (no team id discovered) |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ❌ 502 |
| leaderboard | ✅ 200 |

## mens-college-volleyball

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ❌ 200 (200 but empty/unusable payload) |
| team schedule | ✅ 200 |
| team injuries | ✅ 200 |
| athlete gamelog | ❌ error (no athlete id discovered) |
| athlete stats | ❌ error (no athlete id discovered) |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |

## womens-college-volleyball

| Endpoint | Result |
|---|---|
| scoreboard | ✅ 200 |
| teams | ✅ 200 |
| standings (site v2) | ❌ 200 (200 but empty/unusable payload) |
| standings (apis/v2) | ✅ 200 |
| team roster | ❌ 200 (200 but empty/unusable payload) |
| team schedule | ✅ 200 |
| team injuries | ✅ 200 |
| athlete gamelog | ❌ error (no athlete id discovered) |
| athlete stats | ❌ error (no athlete id discovered) |
| transactions | ✅ 200 |
| event odds | ❌ 404 |
| event summary | ✅ 200 |
