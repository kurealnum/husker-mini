import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { fetchTeamDirectory, type SportsTeamInfo } from "@/lib/sports/team-directory";
import { predictionStages } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

export class AmbiguousTeamResolutionError extends Error {}

export interface ResolvedTeams {
  team1: string;
  team2: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nickname(displayName: string): string {
  return displayName.trim().split(/\s+/).pop() ?? displayName;
}

function findMatches(title: string, teams: SportsTeamInfo[]): SportsTeamInfo[] {
  return teams.filter((team) => {
    const candidates = [team.abbreviation, nickname(team.displayName), team.displayName];
    return candidates.some((candidate) => {
      const pattern = new RegExp(`\\b${escapeRegex(candidate)}\\b`, "i");
      return pattern.test(title);
    });
  });
}

/**
 * Matches the two teams referenced in a Kalshi event title against the
 * sports provider's team directory, and stores the resolved mapping on the
 * stage record. Anything other than exactly two distinct matches fails the
 * prediction rather than guessing.
 */
export async function resolveTeamsStage(
  predictionId: string,
  sport: string,
  eventTitle: string,
  sportsApiBaseUrl: string,
): Promise<ResolvedTeams> {
  const stageId = await startStage(predictionId, "resolve_teams");

  try {
    const directory = await fetchTeamDirectory(sport, sportsApiBaseUrl);
    const matches = findMatches(eventTitle, directory);

    // Multiple matched teams can share the same nickname (e.g. "Giants");
    // dedupe by display name before judging ambiguity.
    const distinct = [...new Map(matches.map((m) => [m.displayName, m])).values()];

    if (distinct.length !== 2) {
      throw new AmbiguousTeamResolutionError(
        `Expected exactly 2 teams in event title "${eventTitle}", matched ${distinct.length}: ` +
          distinct.map((t) => t.displayName).join(", "),
      );
    }

    const resolved: ResolvedTeams = { team1: distinct[0].displayName, team2: distinct[1].displayName };

    await completeStage(stageId, "Teams resolved.", { ...resolved, eventTitle });
    return resolved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failStage(stageId, message);
    throw error;
  }
}

// Re-exported so callers can inspect the persisted mapping without redoing resolution.
export async function getStoredTeamMapping(predictionId: string): Promise<ResolvedTeams | null> {
  const [stage] = await db
    .select()
    .from(predictionStages)
    .where(and(eq(predictionStages.predictionId, predictionId), eq(predictionStages.stage, "resolve_teams")))
    .orderBy(predictionStages.createdAt)
    .limit(1);

  if (!stage || !stage.metadata) return null;
  const metadata = stage.metadata as Record<string, unknown>;
  if (typeof metadata.team1 !== "string" || typeof metadata.team2 !== "string") return null;
  return { team1: metadata.team1, team2: metadata.team2 };
}
