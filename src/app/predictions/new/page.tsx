import { NewPredictionForm } from "./new-prediction-form";

/** Page for starting a new prediction from a Kalshi event ticker. */
export default function NewPredictionPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">New Prediction</h1>
      <p className="text-muted-foreground">
        Enter a Kalshi event ticker to start a new prediction.
      </p>
      <NewPredictionForm />
    </div>
  );
}
