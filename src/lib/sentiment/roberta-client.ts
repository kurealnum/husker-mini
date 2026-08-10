export interface SentimentLabelScore {
  label: "negative" | "neutral" | "positive";
  score: number;
}

/** Runs cardiffnlp/twitter-roberta-base-sentiment-latest via the Hugging Face Inference API. */
export async function classifySentiment(
  text: string,
  modelId: string,
  apiKey: string,
): Promise<SentimentLabelScore[]> {
  // TEMP STUB: skip Hugging Face call for local testing. Unset STUB_EXTERNAL_CALLS to restore.
  if (process.env.STUB_EXTERNAL_CALLS === "true") {
    return [
      { label: "positive", score: 0.6 },
      { label: "neutral", score: 0.3 },
      { label: "negative", score: 0.1 },
    ];
  }

  const response = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text }),
  });

  if (!response.ok) {
    throw new Error(`Sentiment model request failed (${response.status}).`);
  }

  const data = (await response.json()) as SentimentLabelScore[][] | SentimentLabelScore[];
  // The Inference API returns a nested array per input for classification models.
  return Array.isArray(data[0]) ? (data[0] as SentimentLabelScore[]) : (data as SentimentLabelScore[]);
}
