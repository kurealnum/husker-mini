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
