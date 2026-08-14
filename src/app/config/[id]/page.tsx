import Link from "next/link";
import { notFound } from "next/navigation";

import { getPredictionConfigVersionById } from "@/lib/config/prediction-config";
import { getLeague } from "@/lib/leagues/registry";
import { ESPN_MODEL_SPEC } from "@/lib/win-probability-model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TECHNICAL_MODEL_SPEC = {
  version: "1.0.0",
  name: "Score/game-progress technical formula",
  formula: "f(S) = 1 / (1 + e^(-k * S * ((T1 - T2) / (T1 + T2))))",
  description:
    "Logistic function over current score differential, scaled by game progress (0 at " +
    "kickoff/first pitch, 1 at scheduled end) and the tunable k parameter. T1 = T2 = 0 is treated " +
    "as a coin flip rather than dividing by zero.",
};

function DefinitionList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {items.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}

/**
 * Read-only model version detail page: every parameter that went into
 * predictions generated against this config version, across all three
 * pipeline phases (team scores/game progress, ESPN analysis, LLM combiner).
 * Config versions are immutable/append-only, so this page never changes for
 * a given id — it's a permanent record of what a prediction's "model
 * version" actually means.
 */
export default async function ConfigVersionPage({ params }: PageProps<"/config/[id]">) {
  const { id } = await params;
  const versionId = Number(id);
  if (!Number.isInteger(versionId)) {
    notFound();
  }

  const version = await getPredictionConfigVersionById(versionId);
  if (!version) {
    notFound();
  }

  const league = getLeague(version.league);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/config" className="w-fit text-sm text-muted-foreground hover:underline">
        ← Back to config
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        {league.displayName} — model version v{version.id}
      </h1>
      <p className="text-muted-foreground">
        Immutable record. Predictions generated against v{version.id} always used exactly these
        parameters, even if newer versions exist now.
      </p>

      <Section title="Global">
        <DefinitionList
          items={[
            ["League", league.displayName],
            ["Trading mode", version.tradingMode],
            ["Kill switch", version.killSwitchEnabled ? "enabled" : "off"],
            ["Technical weight (team scores/game progress)", version.technicalWeight],
            ["ESPN weight (ESPN analysis)", version.espnWeight],
            ["Combiner weight (LLM combiner)", version.combinerWeight],
            ["Edge threshold", version.edgeThreshold],
            ["Created", version.createdAt.toLocaleString()],
          ]}
        />
      </Section>

      {version.backtestAccuracy != null && (
        <Section title="Backtest gate">
          <DefinitionList
            items={[
              ["Accuracy", `${(version.backtestAccuracy * 100).toFixed(1)}%`],
              [
                "Threshold in force",
                version.backtestThreshold != null ? `${(version.backtestThreshold * 100).toFixed(1)}%` : "—",
              ],
              ["Recorded", version.backtestRecordedAt?.toLocaleString() ?? "—"],
              ["Notes", version.backtestNotes ?? "—"],
            ]}
          />
        </Section>
      )}

      <Section title="Phase 1: Team scores / game progress model">
        <DefinitionList
          items={[
            ["Model version", TECHNICAL_MODEL_SPEC.version],
            ["Technical K", version.technicalK],
            ["Formula", <code key="f" className="font-mono text-xs">{TECHNICAL_MODEL_SPEC.formula}</code>],
            ["Description", TECHNICAL_MODEL_SPEC.description],
          ]}
        />
      </Section>

      <Section title="Phase 2: ESPN analysis model">
        <DefinitionList items={[["Model version applicable to this league", league.winProbabilityModelVersion]]} />
        {league.winProbabilityModelVersion !== ESPN_MODEL_SPEC.version ? (
          <p className="text-sm text-muted-foreground">
            No documented spec for model version {league.winProbabilityModelVersion} yet — {ESPN_MODEL_SPEC.name}{" "}
            below is version {ESPN_MODEL_SPEC.version}.
          </p>
        ) : null}
        <DefinitionList
          items={[
            ["Name", ESPN_MODEL_SPEC.name],
            ["Model type", ESPN_MODEL_SPEC.modelType],
            ["Target", ESPN_MODEL_SPEC.target],
            ["Trained accuracy", `${(ESPN_MODEL_SPEC.trainedAccuracy * 100).toFixed(1)}%`],
            ["Trained ROC AUC", ESPN_MODEL_SPEC.trainedRocAuc],
            ["Minimum games of history required", ESPN_MODEL_SPEC.minGamesHistory],
            ["Intercept", ESPN_MODEL_SPEC.intercept],
          ]}
        />
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Coefficient</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ESPN_MODEL_SPEC.coefficients.map((c) => (
                <TableRow key={c.feature}>
                  <TableCell>{c.label}</TableCell>
                  <TableCell className="font-mono">{c.weight}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DefinitionList
          items={[
            ["Elo K-factor", ESPN_MODEL_SPEC.eloParams.kFactor],
            ["Elo home-field bonus", ESPN_MODEL_SPEC.eloParams.homeFieldBonus],
            ["Elo default rating", ESPN_MODEL_SPEC.eloParams.defaultRating],
          ]}
        />
      </Section>

      <Section title="Phase 3: LLM combiner">
        <DefinitionList items={[["OpenAI model", version.combinerModel]]} />
      </Section>
    </div>
  );
}
