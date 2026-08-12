import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const CombinerOutputSchema = z.object({
  probability: z.number(),
  reasoning: z.string(),
});

export type CombinerOutput = z.infer<typeof CombinerOutputSchema>;

export interface CombinerInputs {
  technicalProbability: number;
  technicalReasoning: Record<string, unknown>;
  espnProbability: number;
  /** OpenAI model id, from the active prediction config version's combiner subsection. */
  model: string;
}

/**
 * Sends the technical analysis to OpenAI for a reasoned probability
 * assessment, returned as validated structured output.
 */
export async function combineAnalyses(inputs: CombinerInputs): Promise<CombinerOutput> {
  // TEMP STUB: skip OpenAI call for local testing. Unset STUB_EXTERNAL_CALLS to restore.
  if (process.env.STUB_EXTERNAL_CALLS === "true") {
    return {
      probability: inputs.technicalProbability,
      reasoning: "Stubbed combiner output (STUB_EXTERNAL_CALLS=true).",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY must be configured.");
  }

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.parse({
    model: inputs.model,
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You are a sports prediction analyst. You are given two independent probability " +
          "estimates that the same team wins: a technical estimate (score/game-clock based) " +
          "and an ESPN analysis estimate (a trained win-probability model over team stats). " +
          "Review both and return a reasoned probability estimate for the same outcome.",
      },
      {
        role: "user",
        content: JSON.stringify({
          technicalProbability: inputs.technicalProbability,
          technicalReasoning: inputs.technicalReasoning,
          espnProbability: inputs.espnProbability,
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
