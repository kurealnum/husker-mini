# Volleyball — not built

## Blocking check result

Per issue #157's Kalshi series audit (`docs/kalshi-series-audit.md`) and
re-confirmed live for this issue:

- Kalshi lists exactly one volleyball series, `KXVOLLEYBALLMATCH`.
- It has **zero recorded volume** across every market on it (`volume_fp`
  is `0.00` on all 6 currently listed markets, both active and
  finalized).
- Its markets are **not NCAA** — the listed events are the 2026 Pan
  American Cup (e.g. "Cuba vs Mexico men's Pan American Cup 2026 match"),
  an international competition. ESPN only carries NCAA volleyball
  (`mens-college-volleyball`, `womens-college-volleyball`), so even if
  this series had volume, its matches wouldn't be coverable by ESPN's
  feature data anyway — a second, independent reason not to build.

## Decision

Per the issue's blocking check: **do not build a volleyball pipeline.**
No registry entry, no pipeline, no model — building any of it would be
speculative work against a market with no trading activity and no
matching data source. This issue is closed with that finding recorded,
per its own acceptance criteria, rather than shipping code against a
market nobody trades.

If Kalshi later lists an NCAA volleyball series with real volume, this
finding should be revisited — the registry and pipeline patterns
established for the other head-to-head, set-based sport in this epic
(tennis: `src/pipeline/tennis-pipeline.ts`) are the template a future
volleyball pipeline would follow, adapted for team (not athlete)
competitors.
