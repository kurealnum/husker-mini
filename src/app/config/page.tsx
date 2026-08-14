import Link from "next/link";

import { listPredictionConfigVersions } from "@/lib/config/prediction-config";
import { getLeague, LEAGUE_REGISTRY } from "@/lib/leagues/registry";
import { getPipelineForLeague } from "@/pipeline/run-prediction";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ConfigVersionForm } from "./config-version-form";

/** League tab strip. A plain link per league (not a client-side select) so the page works with JS disabled. */
function LeagueTabs({ activeLeague }: { activeLeague: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.values(LEAGUE_REGISTRY).map((league) => (
        <Link
          key={league.key}
          href={`/config?league=${league.key}`}
          className={
            league.key === activeLeague
              ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              : "rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          {league.displayName}
        </Link>
      ))}
    </div>
  );
}

/** Page for viewing one league's prediction config version history and creating a new version for it. */
export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league: leagueParam } = await searchParams;
  const leagueKey = leagueParam && LEAGUE_REGISTRY[leagueParam] ? leagueParam : Object.keys(LEAGUE_REGISTRY)[0];
  const league = getLeague(leagueKey);

  const versions = await listPredictionConfigVersions(leagueKey);
  const active = versions[0] ?? null;
  const pipeline = getPipelineForLeague(leagueKey);
  const configFields = pipeline?.configFields ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Prediction Config</h1>
        <p className="text-muted-foreground">
          Every league has its own independent version history. Every edit creates a new version
          for the selected league only — predictions stay attached to the version they were
          generated with, so older predictions remain reproducible.
        </p>
      </div>

      <LeagueTabs activeLeague={leagueKey} />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
        <span className="font-medium">{league.displayName}</span>
        <Badge variant={active?.tradingMode === "live" ? "default" : "secondary"}>
          {active?.tradingMode === "live" ? "live trading" : "paper trading"}
        </Badge>
        {active?.killSwitchEnabled && <Badge variant="destructive">kill switch on</Badge>}
        {active?.backtestAccuracy != null && (
          <span className="text-muted-foreground">
            Backtest: {(active.backtestAccuracy * 100).toFixed(1)}% (threshold{" "}
            {active.backtestThreshold != null ? `${(active.backtestThreshold * 100).toFixed(1)}%` : "—"})
          </span>
        )}
      </div>

      <ConfigVersionForm key={leagueKey} league={leagueKey} active={active} configFields={configFields} />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Version history</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Technical Weight</TableHead>
                <TableHead>ESPN Weight</TableHead>
                <TableHead>Combiner Weight</TableHead>
                <TableHead>Edge Threshold</TableHead>
                <TableHead>Technical K</TableHead>
                <TableHead>OpenAI Model</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell>
                    <Link href={`/config/${version.id}`} className="underline hover:no-underline">
                      v{version.id}
                    </Link>
                    {version.id === active?.id && (
                      <Badge variant="secondary" className="ml-2">
                        active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {version.tradingMode}
                    {version.killSwitchEnabled && " (killed)"}
                  </TableCell>
                  <TableCell>{version.technicalWeight}</TableCell>
                  <TableCell>{version.espnWeight}</TableCell>
                  <TableCell>{version.combinerWeight}</TableCell>
                  <TableCell>{version.edgeThreshold}</TableCell>
                  <TableCell>{version.technicalK}</TableCell>
                  <TableCell>{version.combinerModel}</TableCell>
                  <TableCell>{version.createdAt.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {versions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                    No config versions yet for {league.displayName}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
