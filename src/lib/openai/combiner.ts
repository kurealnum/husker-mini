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
  sentimentProbability: number;
  sentimentArticleCount: number;
}

/**
 * Sends the technical and sentiment analyses to OpenAI for a combined
 * probability assessment, returned as validated structured output.
 */
export async function combineAnalyses(inputs: CombinerInputs): Promise<CombinerOutput> {
  // TEMP STUB: skip OpenAI call for local testing. Unset STUB_EXTERNAL_CALLS to restore.
  if (process.env.STUB_EXTERNAL_CALLS === "true") {
    return {
      probability: (inputs.technicalProbability + inputs.sentimentProbability) / 2,
      reasoning: "Stubbed combiner output (STUB_EXTERNAL_CALLS=true).",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_COMBINER_MODEL;
  if (!apiKey || !model) {
    throw new Error("OPENAI_API_KEY and OPENAI_COMBINER_MODEL must be configured.");
  }

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.parse({
    model,
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You are a sports prediction analyst. Given a technical (score/game-clock based) " +
          "probability and a sentiment (news-based) probability that a team wins, combine " +
          "them into a single reasoned probability estimate for the same outcome.",
      },
      {
        role: "user",
        content: JSON.stringify(inputs),
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
