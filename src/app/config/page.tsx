import Link from "next/link";

import { listPredictionConfigVersions } from "@/lib/config/prediction-config";
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

/** Page for viewing prediction config version history and creating a new version. */
export default async function ConfigPage() {
  const versions = await listPredictionConfigVersions();
  const active = versions[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Prediction Config</h1>
        <p className="text-muted-foreground">
          Every edit creates a new version. Predictions stay attached to the version they were
          generated with, so older predictions remain reproducible.
        </p>
      </div>

      <ConfigVersionForm active={active} />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Version history</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
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
                  <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                    No config versions yet.
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
