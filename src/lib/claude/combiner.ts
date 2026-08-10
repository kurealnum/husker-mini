import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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
 * Sends the technical and sentiment analyses to Claude for a combined
 * probability assessment, returned as validated structured output.
 */
export async function combineAnalyses(inputs: CombinerInputs): Promise<CombinerOutput> {
  // TEMP STUB: skip Anthropic call for local testing. Unset STUB_EXTERNAL_CALLS to restore.
  if (process.env.STUB_EXTERNAL_CALLS === "true") {
    return {
      probability: (inputs.technicalProbability + inputs.sentimentProbability) / 2,
      reasoning: "Stubbed combiner output (STUB_EXTERNAL_CALLS=true).",
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_COMBINER_MODEL;
  if (!apiKey || !model) {
    throw new Error("ANTHROPIC_API_KEY and CLAUDE_COMBINER_MODEL must be configured.");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.parse({
    model,
    max_tokens: 1024,
    system:
      "You are a sports prediction analyst. Given a technical (score/game-clock based) " +
      "probability and a sentiment (news-based) probability that a team wins, combine " +
      "them into a single reasoned probability estimate for the same outcome.",
    messages: [
      {
        role: "user",
        content: JSON.stringify(inputs),
      },
    ],
    output_config: {
      format: zodOutputFormat(CombinerOutputSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Combiner model did not return parseable structured output.");
  }

  return response.parsed_output;
}
