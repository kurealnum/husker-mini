/**
 * Player-level strength metrics derived from a team's roster and each
 * player's game log, both fetched via the ESPN wrapper (`@/lib/espn`).
 * Stat keys (e.g. "points", "minutes") vary by sport and are passed through
 * as-is from `EspnGamelogEntry.stats`; callers are expected to know their
 * sport's stat vocabulary. "minutes" is the conventional key used for
 * minutes/snap-distribution metrics.
 */
import type { EspnAthlete, EspnGamelogEntry } from "@/lib/espn";

export interface PlayerGamelog {
  athlete: EspnAthlete;
  entries: EspnGamelogEntry[];
}

/** Sum of a stat across a player's game log. */
function sumStat(entries: EspnGamelogEntry[], statKey: string): number {
  return entries.reduce((sum, e) => sum + (e.stats[statKey] ?? 0), 0);
}

function avgStat(entries: EspnGamelogEntry[], statKey: string): number {
  if (entries.length === 0) return 0;
  return sumStat(entries, statKey) / entries.length;
}

/** Team-wide roll-up of a stat: total and per-game average across all rostered players. */
export function aggregatePlayerStats(
  logs: PlayerGamelog[],
  statKey: string,
): { total: number; average: number } {
  const allEntries = logs.flatMap((l) => l.entries);
  return {
    total: logs.reduce((sum, l) => sum + sumStat(l.entries, statKey), 0),
    average: avgStat(allEntries, statKey),
  };
}

export interface TopPlayerStat {
  athlete: EspnAthlete;
  average: number;
}

/** The `limit` best performers by a stat's per-game average, descending. */
export function topPlayerStats(logs: PlayerGamelog[], statKey: string, limit = 5): TopPlayerStat[] {
  return logs
    .map((l) => ({ athlete: l.athlete, average: avgStat(l.entries, statKey) }))
    .sort((a, b) => b.average - a.average)
    .slice(0, limit);
}

export interface MinutesShare {
  athlete: EspnAthlete;
  /** Fraction of the team's total logged minutes this player accounts for. */
  share: number;
}

/** Distribution of minutes (or snaps, if that's the sport's "minutes" key) across the roster. */
export function minutesDistribution(logs: PlayerGamelog[]): MinutesShare[] {
  const totals = logs.map((l) => ({ athlete: l.athlete, minutes: sumStat(l.entries, "minutes") }));
  const teamTotal = totals.reduce((sum, t) => sum + t.minutes, 0);

  return totals.map((t) => ({
    athlete: t.athlete,
    share: teamTotal > 0 ? t.minutes / teamTotal : 0,
  }));
}

export interface RecentPlayerForm {
  athlete: EspnAthlete;
  recentAverage: number;
}

/** Per-player trailing average of a stat over the most recent `windowSize` games. */
export function recentPlayerForm(
  logs: PlayerGamelog[],
  statKey: string,
  windowSize = 5,
): RecentPlayerForm[] {
  return logs.map((l) => ({
    athlete: l.athlete,
    recentAverage: avgStat(l.entries.slice(-windowSize), statKey),
  }));
}
