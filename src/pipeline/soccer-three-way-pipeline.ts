import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assertNotKilled, getActivePredictionConfigVersion } from "@/lib/config/prediction-config";
import { getSportsProvider } from "@/lib/sports";
import { headToHead } from "@/lib/sports/provider";
import { computeSoccerTechnicalProbabilities } from "@/lib/soccer-technical-formula";
import type { ThreeWayProbabilities } from "@/lib/soccer-win-probability-model";
import type { LeagueDefinition } from "@/lib/leagues/registry";
import { predictions, type Prediction } from "@/database/schemas";

import { assembleFeaturesStage } from "./assemble-features";
import { combineAnalysesStage } from "./combine-analyses";
import { completePredictionStage } from "./complete-prediction";
import { executeOrderStage } from "./execute-order";
import type { SportPipeline } from "./pipeline-contract";
import { resolveTeamsStage } from "./resolve-teams";
import { calculateThreeWayMarketEdgeStage, type ThreeWayMarketLeg } from "./soccer/calculate-three-way-market-edge";
import { calculateThreeWayModelProbabilityStage } from "./soccer/calculate-three-way-model-probability";
import { fetchThreeWayKalshiEventStage, type ThreeWayMarketLegRef } from "./soccer/fetch-three-way-kalshi-event";
import { completeStage, failStage, startStage } from "./stages";
import { technicalAnalysisStage } from "./technical-analysis";

export class MissingGameDataError extends Error {}
export class AmbiguousThreeWayLegError extends Error {}

/** A draw-neutral 1/3-each distribution, used when a team lacks enough season history to trust a real estimate. */
const COIN_FLIP_THREE_WAY: ThreeWayProbabilities = {
  homeWinProbability: 1 / 3,
  awayWinProbability: 1 / 3,
  drawProbability: 1 / 3,
};

/** True if a Kalshi leg's display name and an ESPN team's display name plausibly refer to the same team. */
function namesMatch(teamName: string, legName: string): boolean {
  const a = teamName.trim().toLowerCase();
  const b = legName.trim().toLowerCase();
  return a.includes(b) || b.includes(a);
}

/** Matches the two non-draw Kalshi legs to `team1`/`team2` by display name. */
function matchTeamLegs(
  teamLegs: [ThreeWayMarketLegRef, ThreeWayMarketLegRef],
  team1Name: string,
  team2Name: string,
): { team1Leg: ThreeWayMarketLegRef; team2Leg: ThreeWayMarketLegRef } {
  const team1Leg = teamLegs.find((leg) => namesMatch(team1Name, leg.name));
  const team2Leg = teamLegs.find((leg) => leg !== team1Leg && namesMatch(team2Name, leg.name));

  if (!team1Leg || !team2Leg) {
    throw new AmbiguousThreeWayLegError(
      `Could not match Kalshi legs [${teamLegs.map((l) => l.name).join(", ")}] to ESPN teams "${team1Name}"/"${team2Name}".`,
    );
  }

  return { team1Leg, team2Leg };
}

/**
 * Pipeline for three-way (soccer) leagues: two teams, three outcomes (team1
 * win, team2 win, draw), each settled as its own independent Kalshi
 * market. Diverges from `headToHeadClockPipeline` starting at
 * `fetch_kalshi_event` (three markets, not a single priced one plus its
 * complement) and again at `calculate_model_probability` /
 * `calculate_market_edge` (a three-way blend and a best-of-three-legs edge
 * decision, instead of one binary blend/decision). `resolve_teams`,
 * `find_sports_game`, `combine_analyses`, `execute_order`, and
 * `complete_prediction` are reused unchanged — a three-way bet always
 * resolves to "buy YES on exactly one leg's own ticker," which is exactly
 * what the shared `execute_order` already does once `calculate_market_edge`
 * has picked that ticker.
 *
 * ```mermaid
 * flowchart TD
 *   A[fetch_kalshi_event] --> B[resolve_teams]
 *   B --> C[find_sports_game]
 *   C --> D[technical_analysis]
 *   C --> E[assemble_features]
 *   E --> F[combine_analyses]
 *   D --> G[calculate_model_probability]
 *   E --> G
 *   F --> G
 *   G --> H[calculate_market_edge]
 *   H --> I[execute_order]
 *   I --> J[complete_prediction]
 * ```
 */
export const soccerThreeWayPipeline: SportPipeline = {
  configFields: [
    { key: "technicalK", label: "Technical K", type: "number" },
    { key: "combinerModel", label: "OpenAI Model", type: "text" },
  ],

  async run(predictionId: string, prediction: Prediction, league: LeagueDefinition): Promise<void> {
    const configVersion = await getActivePredictionConfigVersion(league.key);
    assertNotKilled(configVersion);

    const { response: kalshiResponse, markets: threeWayMarkets } = await fetchThreeWayKalshiEventStage(
      predictionId,
      prediction.kalshiEventTicker,
    );

    const sportsApiBaseUrl = process.env.SPORTS_PROVIDER_API_BASE_URL!;
    const teams = await resolveTeamsStage(predictionId, league.key, kalshiResponse.event.markets, sportsApiBaseUrl);

    const findGameStageId = await startStage(predictionId, "find_sports_game");
    const sportsProvider = getSportsProvider();
    const contest = await sportsProvider.findGame({ league: league.key, team1: teams.team1, team2: teams.team2 });
    if (!contest) {
      const message = `No sports data found for ${teams.team1} vs ${teams.team2}.`;
      await failStage(findGameStageId, message);
      throw new MissingGameDataError(message);
    }
    await completeStage(findGameStageId, "Sports game found.");
    const game = headToHead(contest);

    const technicalAnalysis = await technicalAnalysisStage(predictionId, configVersion.technicalK, game, league);
    const technicalThreeWay = computeSoccerTechnicalProbabilities(
      configVersion.technicalK,
      game.gameProgress,
      game.team1.score,
      game.team2.score,
    );

    const gameFeatures = await assembleFeaturesStage(predictionId, league.key, game);
    const espnThreeWay: ThreeWayProbabilities = gameFeatures.espnThreeWay
      ? {
          homeWinProbability: gameFeatures.espnThreeWay.team1WinProbability,
          awayWinProbability: gameFeatures.espnThreeWay.team2WinProbability,
          drawProbability: gameFeatures.espnThreeWay.drawProbability,
        }
      : COIN_FLIP_THREE_WAY;

    const claudeOutput = await combineAnalysesStage(
      predictionId,
      game,
      gameFeatures.rawEspnData,
      configVersion,
      league,
    );

    const blended = await calculateThreeWayModelProbabilityStage(
      predictionId,
      technicalAnalysis,
      technicalThreeWay,
      espnThreeWay,
      claudeOutput,
      configVersion,
    );

    await db.update(predictions).set({ modelProbability: blended.team1 }).where(eq(predictions.id, predictionId));

    const { team1Leg, team2Leg } = matchTeamLegs(threeWayMarkets.teamLegs, game.team1.name, game.team2.name);
    const legs: ThreeWayMarketLeg[] = [
      { outcome: "team1", ticker: team1Leg.ticker, marketPrice: team1Leg.price, modelProbability: blended.team1 },
      { outcome: "team2", ticker: team2Leg.ticker, marketPrice: team2Leg.price, modelProbability: blended.team2 },
      {
        outcome: "draw",
        ticker: threeWayMarkets.draw.ticker,
        marketPrice: threeWayMarkets.draw.price,
        modelProbability: blended.draw,
      },
    ];

    const withDecision = await calculateThreeWayMarketEdgeStage(predictionId, legs, configVersion, league.key);

    await executeOrderStage(predictionId, withDecision, configVersion);

    await completePredictionStage(predictionId, {
      kalshiResponse,
      sportsGame: game,
      technicalModelVersion: technicalAnalysis.analysisVersion,
      espnModelVersion: gameFeatures.espnModelVersion,
      combinerVersion: configVersion.combinerModel,
      configVersion,
      winProbabilityModelVersion: league.winProbabilityModelVersion,
    });
  },
};
