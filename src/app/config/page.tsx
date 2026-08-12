import Link from "next/link";

import { listPredictionConfigVersions } from "@/lib/config/prediction-config";

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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Technical Weight</th>
                <th className="px-3 py-2 font-medium">ESPN Weight</th>
                <th className="px-3 py-2 font-medium">Combiner Weight</th>
                <th className="px-3 py-2 font-medium">Edge Threshold</th>
                <th className="px-3 py-2 font-medium">Technical K</th>
                <th className="px-3 py-2 font-medium">OpenAI Model</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/config/${version.id}`} className="underline hover:no-underline">
                      v{version.id}
                    </Link>
                    {version.id === active?.id && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">active</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{version.technicalWeight}</td>
                  <td className="px-3 py-2">{version.espnWeight}</td>
                  <td className="px-3 py-2">{version.combinerWeight}</td>
                  <td className="px-3 py-2">{version.edgeThreshold}</td>
                  <td className="px-3 py-2">{version.technicalK}</td>
                  <td className="px-3 py-2">{version.combinerModel}</td>
                  <td className="px-3 py-2">{version.createdAt.toLocaleString()}</td>
                </tr>
              ))}
              {versions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    No config versions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
