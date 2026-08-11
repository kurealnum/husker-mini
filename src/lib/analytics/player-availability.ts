/**
 * Player availability / injury-impact metrics, built from the ESPN wrapper's
 * team injuries data plus the roster grouping used to infer starters and the
 * per-player stats from `@/lib/analytics/player-strength` for lost-production
 * estimates.
 */
import type { EspnInjury, EspnRosterResponse } from "@/lib/espn";
import type { PlayerGamelog } from "./player-strength";

export type InjurySeverity = "out" | "doubtful" | "questionable" | "probable" | "unknown";

/** Numeric severity, higher = more likely to miss the game (0-1). */
const SEVERITY_WEIGHT: Record<InjurySeverity, number> = {
  out: 1,
  doubtful: 0.75,
  questionable: 0.5,
  probable: 0.15,
  unknown: 0.5,
};

/** Maps ESPN's free-text injury status to a normalized severity bucket. */
export function classifySeverity(status: string): InjurySeverity {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("out") || normalized.includes("injured reserve") || normalized === "ir") {
    return "out";
  }
  if (normalized.includes("doubtful")) return "doubtful";
  if (normalized.includes("questionable")) return "questionable";
  if (normalized.includes("probable")) return "probable";
  return "unknown";
}

export function severityWeight(severity: InjurySeverity): number {
  return SEVERITY_WEIGHT[severity];
}

export interface InjuredPlayer {
  athleteId: string;
  athleteName: string;
  status: string;
  severity: InjurySeverity;
  isStarter: boolean;
  /** Estimated production this player would contribute per game, weighted by likelihood of missing. */
  estimatedLostProduction: number;
}

/**
 * A roster's starters, inferred from ESPN's roster grouping: within each
 * position group, the first-listed athlete is treated as the starter. This
 * is a heuristic — ESPN doesn't expose an explicit "starter" flag.
 */
export function inferStarterIds(roster: EspnRosterResponse): Set<string> {
  const starters = new Set<string>();
  for (const group of roster.athletes) {
    const first = group.items[0];
    if (first) starters.add(first.id);
  }
  return starters;
}

/**
 * Builds the full injured-player list for a team, combining injury status,
 * starter inference, and estimated lost production (this player's recent
 * per-game average of `productionStatKey`, weighted by severity).
 */
export function computeInjuredPlayers(
  injuries: EspnInjury[],
  starterIds: Set<string>,
  gamelogs: PlayerGamelog[],
  productionStatKey: string,
): InjuredPlayer[] {
  const gamelogByAthleteId = new Map(gamelogs.map((g) => [g.athlete.id, g]));

  return injuries
    .filter((injury) => injury.athlete)
    .map((injury) => {
      const athleteId = injury.athlete!.id;
      const severity = classifySeverity(injury.status);
      const gamelog = gamelogByAthleteId.get(athleteId);
      const recentEntries = gamelog?.entries.slice(-5) ?? [];
      const avgProduction =
        recentEntries.length > 0
          ? recentEntries.reduce((sum, e) => sum + (e.stats[productionStatKey] ?? 0), 0) /
            recentEntries.length
          : 0;

      return {
        athleteId,
        athleteName: injury.athlete!.displayName,
        status: injury.status,
        severity,
        isStarter: starterIds.has(athleteId),
        estimatedLostProduction: avgProduction * severityWeight(severity),
      };
    });
}

/** Sum of estimated lost production across all injured players — a team-wide impact score. */
export function totalEstimatedLostProduction(injuredPlayers: InjuredPlayer[]): number {
  return injuredPlayers.reduce((sum, p) => sum + p.estimatedLostProduction, 0);
}

/** Whether any injured player is inferred to be a starter. */
export function hasStarterAvailabilityRisk(injuredPlayers: InjuredPlayer[]): boolean {
  return injuredPlayers.some((p) => p.isStarter);
}
