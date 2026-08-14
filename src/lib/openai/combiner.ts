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

/** One competitor's current score, deliberately unlabeled by identity. */
export interface CombinerCompetitor {
  /** Generic position label sent to the LLM instead of a team/athlete name, e.g. "competitor1". */
  label: string;
  score: number;
}

/** Whether a higher or a lower score is winning, per the league's score semantics. */
export type ScoreDirection = "higher_wins" | "lower_wins";

export interface CombinerInputs {
  /** Fraction of the contest elapsed (0 at start, 1 at scheduled end, may exceed 1 in overtime). */
  gameProgress: number;
  /** Every competitor's current score, in a fixed order. `probability` in the output is always P(competitors[0] wins). */
  competitors: CombinerCompetitor[];
  scoreDirection: ScoreDirection;
  /**
   * Raw ESPN schedule for every competitor (see `assembleFeaturesStage`), trimmed
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
  /**
   * Max serialized byte size of `rawEspnData` (after trim/redaction) sent to
   * the LLM. Per-league, so one sport's larger payload (e.g. a deeper
   * schedule) can't alone exhaust the shared tokens-per-minute budget while
   * other leagues' pipelines are running concurrently. Oldest schedule
   * events are dropped first when over budget. Defaults to 8000 bytes.
   */
  maxPayloadBytes?: number;
}

const DEFAULT_MAX_PAYLOAD_BYTES = 8000;

/** One competitor's trimmed raw ESPN bundle, as produced by `trimRawEspnData`. */
interface TrimmedCompetitorData {
  schedule?: { events?: unknown[] };
}

/**
 * Drops the oldest schedule event from whichever competitor currently has
 * the most, repeatedly, until the serialized payload fits `maxBytes` or
 * every competitor's schedule is empty. Cheaper competitors' data is left
 * untouched as long as possible.
 */
function enforcePayloadBudget(data: Record<string, unknown>, maxBytes: number): Record<string, unknown> {
  const working = structuredClone(data) as Record<string, TrimmedCompetitorData>;

  const byteLength = () => Buffer.byteLength(JSON.stringify(working));
  const eventCounts = () => Object.values(working).map((c) => c.schedule?.events?.length ?? 0);

  while (byteLength() > maxBytes && eventCounts().some((count) => count > 0)) {
    const [largestKey] = Object.entries(working).reduce<[string, number]>(
      (best, [key, competitor]) => {
        const count = competitor.schedule?.events?.length ?? 0;
        return count > best[1] ? [key, count] : best;
      },
      ["", -1],
    );
    working[largestKey]?.schedule?.events?.shift();
  }

  return working;
}

/**
 * Sends the contest's raw ESPN schedule data and current score/progress to
 * OpenAI for a from-scratch win-probability estimate, returned as validated
 * structured output. Deliberately given none of this app's own computed
 * probabilities/features (technical formula, ESPN win-probability model) —
 * this phase reasons over the same raw material independently, rather than
 * just reviewing the other two phases' conclusions. Team/athlete names are
 * withheld (see `redactTeamNames`) so the estimate can't be biased by identity.
 */
export async function combineAnalyses(inputs: CombinerInputs): Promise<CombinerOutput> {
  // TEMP STUB: skip OpenAI call for local testing. Unset STUB_EXTERNAL_CALLS to restore.
  if (process.env.STUB_EXTERNAL_CALLS === "true") {
    const [first, second] = inputs.competitors;
    const firstLeads = inputs.scoreDirection === "higher_wins" ? first.score >= second.score : first.score <= second.score;
    return {
      probability: firstLeads ? 0.55 : 0.45,
      reasoning: "Stubbed combiner output (STUB_EXTERNAL_CALLS=true).",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY must be configured.");
  }

  const client = new OpenAI({ apiKey, timeout: 10_000, maxRetries: 0 });

  const maxPayloadBytes = inputs.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const trimmedEspnData = enforcePayloadBudget(
    redactTeamNames(trimRawEspnData(inputs.rawEspnData)) as Record<string, unknown>,
    maxPayloadBytes,
  );

  const response = await client.chat.completions.parse({
    model: inputs.model,
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You are a sports prediction analyst. You are given the current contest progress and " +
          "score for each competitor (no names, only generic position labels) plus each " +
          "competitor's raw ESPN schedule results (names redacted). Form your own reasoned " +
          `estimate of the probability that ${inputs.competitors[0]?.label ?? "competitors[0]"} wins. ` +
          `A ${inputs.scoreDirection === "higher_wins" ? "higher" : "lower"} score is winning.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          gameProgress: inputs.gameProgress,
          competitors: inputs.competitors,
          scoreDirection: inputs.scoreDirection,
          rawEspnData: trimmedEspnData,
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
