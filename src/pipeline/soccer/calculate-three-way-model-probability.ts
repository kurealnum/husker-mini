import { db } from "@/lib/db";
import type { CombinerOutput } from "@/lib/openai/combiner";
import type { ThreeWayProbabilities } from "@/lib/soccer-win-probability-model";
import { modelOutputs, type PredictionConfigVersion, type TechnicalAnalysis } from "@/database/schemas";

import { completeStage, failStage, startStage } from "../stages";

const WEIGHT_VERSION = "1.0.0-soccer";

/** A blended three-way distribution — always sums to 1. */
export interface ThreeWayModelProbability {
  team1: number;
  team2: number;
  draw: number;
}

/**
 * Blends the pipeline's three phases into a three-way {team1, team2, draw}
 * distribution. The draw probability blends only the technical and ESPN
 * phases (both draw-aware, per `computeSoccerTechnicalProbabilities` /
 * `computeSoccerWinProbabilities`); the combiner phase only ever estimates
 * "does team1 win" (`CombinerOutput.probability`) — it has no draw
 * opinion — so it contributes only to the team1-vs-team2 split *given no
 * draw*:
 *
 *   drawBlend = weighted average of technical/ESPN draw probabilities
 *   team1GivenNotDraw = weighted blend of technical/ESPN/combiner
 *                       team1-win-given-not-draw probabilities
 *   team1 = (1 - drawBlend) * team1GivenNotDraw
 *   team2 = (1 - drawBlend) * (1 - team1GivenNotDraw)
 *   draw  = drawBlend
 *
 * This always sums to exactly 1 by construction.
 *
 * Persists into the same `model_outputs` table every other league uses:
 * `finalProbability` is team1's blended win probability (the same
 * convention every other league's row uses), and the full three-way
 * breakdown is additionally stored under `claudeOutput.threeWay` — the
 * only free-form column available without a schema migration.
 */
export async function calculateThreeWayModelProbabilityStage(
  predictionId: string,
  technicalAnalysis: TechnicalAnalysis,
  technicalThreeWay: ThreeWayProbabilities,
  espnThreeWay: ThreeWayProbabilities,
  claudeOutput: CombinerOutput,
  configVersion: PredictionConfigVersion,
): Promise<ThreeWayModelProbability> {
  const stageId = await startStage(predictionId, "calculate_model_probability");

  try {
    const { technicalWeight, espnWeight, combinerWeight, combinerModel } = configVersion;

    const drawWeightTotal = technicalWeight + espnWeight;
    const drawBlend =
      drawWeightTotal > 0
        ? (technicalWeight * technicalThreeWay.drawProbability + espnWeight * espnThreeWay.drawProbability) /
          drawWeightTotal
        : (technicalThreeWay.drawProbability + espnThreeWay.drawProbability) / 2;

    // Each phase's team1-win-given-not-draw probability, renormalizing away
    // its own draw mass so all three phases blend on the same footing.
    const technicalGivenNotDraw =
      technicalThreeWay.homeWinProbability /
      Math.max(1e-9, technicalThreeWay.homeWinProbability + technicalThreeWay.awayWinProbability);
    const espnGivenNotDraw =
      espnThreeWay.homeWinProbability / Math.max(1e-9, espnThreeWay.homeWinProbability + espnThreeWay.awayWinProbability);
    const combinerGivenNotDraw = claudeOutput.probability;

    const totalWeight = technicalWeight + espnWeight + combinerWeight;
    const team1GivenNotDraw =
      totalWeight > 0
        ? (technicalWeight * technicalGivenNotDraw +
            espnWeight * espnGivenNotDraw +
            combinerWeight * combinerGivenNotDraw) /
          totalWeight
        : technicalGivenNotDraw;

    const team1 = (1 - drawBlend) * team1GivenNotDraw;
    const team2 = (1 - drawBlend) * (1 - team1GivenNotDraw);
    const draw = drawBlend;

    await db
      .insert(modelOutputs)
      .values({
        predictionId,
        technicalProbability: technicalAnalysis.probability,
        technicalWeight,
        weightVersion: WEIGHT_VERSION,
        espnProbability: espnThreeWay.homeWinProbability,
        espnWeight,
        combinerProbability: claudeOutput.probability,
        combinerWeight,
        finalProbability: team1,
        claudeOutput: { ...claudeOutput, threeWay: { team1, team2, draw } },
        combinerModelVersion: combinerModel,
      });

    await completeStage(stageId, "Three-way model probability calculated.", { team1, team2, draw });
    return { team1, team2, draw };
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
