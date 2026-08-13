import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

import { redactTeamNames } from "./redact-team-names";
import { trimRawEspnData } from "./trim-raw-espn-data";

const CombinerOutputSchema = z.object({
  probability: z.number(),
  reasoning: z.string(),
});

export type CombinerOutput = z.infer<typeof CombinerOutputSchema>;

export interface CombinerInputs {
  /** Fraction of the game elapsed (0 at start, 1 at scheduled end, may exceed 1 in overtime). */
  gameProgress: number;
  /** Current score for each side. Deliberately unlabeled by team identity — "team1"/"team2" only. */
  team1Score: number;
  team2Score: number;
  /**
   * Raw ESPN schedule for both teams (see `assembleFeaturesStage`), trimmed
   * by `trimRawEspnData` before it reaches this function. Roster,
   * injuries, gamelogs, odds, and transactions are all excluded — repeated
   * 429s against OpenAI's tokens-per-minute limit (100k/min) traced back to
   * roster being ~95% of the payload even after trimming to its numeric/id
   * fields (94 players × several small text fields each). Only schedule
   * results (numeric scores, dates, completion) go to the combiner for now.
   */
  rawEspnData: Record<string, unknown>;
  /** OpenAI model id, from the active prediction config version's combiner subsection. */
  model: string;
}

/**
 * Sends the game's raw ESPN schedule data and current score/progress to
 * OpenAI for a from-scratch win-probability estimate, returned as validated
 * structured output. Deliberately given none of this app's own computed
 * probabilities/features (technical formula, ESPN win-probability model) —
 * this phase reasons over the same raw material independently, rather than
 * just reviewing the other two phases' conclusions. Team names are withheld
 * (see `redactTeamNames`) so the estimate can't be biased by team identity.
 */
export async function combineAnalyses(inputs: CombinerInputs): Promise<CombinerOutput> {
  // TEMP STUB: skip OpenAI call for local testing. Unset STUB_EXTERNAL_CALLS to restore.
  if (process.env.STUB_EXTERNAL_CALLS === "true") {
    return {
      probability: inputs.team1Score >= inputs.team2Score ? 0.55 : 0.45,
      reasoning: "Stubbed combiner output (STUB_EXTERNAL_CALLS=true).",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY must be configured.");
  }

  const client = new OpenAI({ apiKey, timeout: 10_000 });

  const response = await client.chat.completions.parse({
    model: inputs.model,
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You are a sports prediction analyst. You are given the current game progress and " +
          "score (team1 vs team2, no team names) plus each team's raw ESPN schedule results " +
          "(team names redacted). Form your own reasoned estimate of the probability that " +
          "team1 wins.",
      },
      {
        role: "user",
        content: JSON.stringify({
          gameProgress: inputs.gameProgress,
          team1Score: inputs.team1Score,
          team2Score: inputs.team2Score,
          rawEspnData: redactTeamNames(trimRawEspnData(inputs.rawEspnData)),
        }),
      },
    ],
    response_format: zodResponseFormat(CombinerOutputSchema, "combiner_output"),
  });

  const parsed = response.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("Combiner model did not return parseable structured output.");
  }

  return parsed;
}
