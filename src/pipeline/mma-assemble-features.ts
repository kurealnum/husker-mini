import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { espnLeaguePath } from "@/lib/leagues/registry";
import type { SportsGame } from "@/lib/sports/provider";
import { computeMmaWinProbability, MMA_MODEL_VERSION } from "@/lib/mma-win-probability-model";
import { technicalAnalyses } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

export interface MmaFeatures {
  espnWinProbability: number;
  espnModelVersion: string;
  rawEspnData: Record<string, unknown>;
}

interface EspnRecord {
  type: string;
  summary: string;
}

interface EspnCompetitor {
  athlete?: { displayName: string };
  records?: EspnRecord[];
}

interface EspnScoreboardResponse {
  events: Array<{ competitions: Array<{ competitors: EspnCompetitor[] }> }>;
}

/** Parses "W-L-D" into a win rate (draws counted as half a win); null if unparseable or winless-and-lossless. */
function winRate(summary: string | undefined): number | null {
  if (!summary) return null;
  const parts = summary.split("-").map(Number);
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  const [wins, losses, draws = 0] = parts;
  const total = wins + losses + draws;
  return total === 0 ? null : (wins + draws * 0.5) / total;
}

/**
 * Athlete-sport equivalent of `assembleFeaturesStage`, deliberately thin —
 * MMA has no roster, injury, gamelog, or athlete-stats endpoint at all
 * (all confirmed 404, see `docs/pipelines/mma.md`). The only feature is
 * each fighter's career record, read directly off the scoreboard response
 * (the same one `MmaSportsProvider` already queried — re-fetched here
 * since `assemble_features` is a separate stage, same as every other
 * pipeline). Falls back to a coin flip if either fighter's record isn't
 * parseable, rather than fabricating one.
 */
export async function mmaAssembleFeaturesStage(
  predictionId: string,
  league: string,
  game: SportsGame,
  sportsApiBaseUrl: string,
): Promise<MmaFeatures> {
  const stageId = await startStage(predictionId, "assemble_features");

  try {
    const path = espnLeaguePath(league);
    const response = await fetch(`${sportsApiBaseUrl}/${path}/scoreboard`);
    if (!response.ok) {
      throw new Error(`ESPN scoreboard request failed (${response.status}).`);
    }
    const data = (await response.json()) as EspnScoreboardResponse;

    const matches = (name: string, c: EspnCompetitor) => {
      const displayName = c.athlete?.displayName?.toLowerCase() ?? "";
      const needle = name.trim().toLowerCase();
      return displayName === needle || displayName.includes(needle) || needle.includes(displayName);
    };

    let team1Rate: number | null = null;
    let team2Rate: number | null = null;
    outer: for (const event of data.events) {
      for (const competition of event.competitions) {
        const c1 = competition.competitors.find((c) => matches(game.team1.name, c));
        const c2 = competition.competitors.find((c) => c !== c1 && matches(game.team2.name, c));
        if (c1 && c2) {
          team1Rate = winRate(c1.records?.find((r) => r.type === "total")?.summary);
          team2Rate = winRate(c2.records?.find((r) => r.type === "total")?.summary);
          break outer;
        }
      }
    }

    const homeIsTeam1 = game.team1.isHome;
    const homeRate = homeIsTeam1 ? team1Rate : team2Rate;
    const awayRate = homeIsTeam1 ? team2Rate : team1Rate;

    const homeWinProbability =
      homeRate != null && awayRate != null
        ? computeMmaWinProbability({ winRateDiff: homeRate - awayRate })
        : 0.5;
    const espnWinProbability = homeIsTeam1 ? homeWinProbability : 1 - homeWinProbability;

    const rawEspnData: Record<string, unknown> = {
      team1: { name: game.team1.name, winRate: team1Rate },
      team2: { name: game.team2.name, winRate: team2Rate },
    };

    await db
      .update(technicalAnalyses)
      .set({ espnAnalytics: rawEspnData, espnWinProbability, espnModelVersion: MMA_MODEL_VERSION })
      .where(eq(technicalAnalyses.predictionId, predictionId));

    await completeStage(stageId, "MMA features assembled.", { espnWinProbability, team1Rate, team2Rate });
    return { espnWinProbability, espnModelVersion: MMA_MODEL_VERSION, rawEspnData };
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
