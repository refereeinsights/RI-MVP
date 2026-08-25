import { readFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

import {
  CORRALIO_OVERTURE_STAGE1_BOUNDS,
  assertWithinOperationalBounds,
  type OverturePlace,
  type SharedVenue,
} from "../../apps/corralio/lib/overtureNearby";
import {
  refreshOvertureCandidatePools,
  type OvertureVenueTarget,
} from "../../apps/corralio/lib/overtureNearby.server";

type InputTarget = {
  canonicalVenueId?: string;
  provisionalVenueId?: string;
  venue: SharedVenue;
  places: OverturePlace[];
};
type InputFile = {
  release: string;
  downloadedBytes: number;
  boxesUsed: number;
  elapsedSeconds: number;
  targets: InputTarget[];
};

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function validateInput(value: unknown): InputFile {
  if (!value || typeof value !== "object") throw new Error("Invalid bounded extract input");
  const row = value as Partial<InputFile>;
  if (
    typeof row.release !== "string"
    || typeof row.downloadedBytes !== "number"
    || typeof row.boxesUsed !== "number"
    || typeof row.elapsedSeconds !== "number"
    || !Array.isArray(row.targets)
  ) throw new Error("Invalid bounded extract input");
  for (const target of row.targets) {
    if (
      !target || typeof target !== "object"
      || (typeof target.canonicalVenueId === "string") === (typeof target.provisionalVenueId === "string")
      || !target.venue || !Array.isArray(target.places)
    ) throw new Error("Invalid bounded venue target");
    if (Object.keys(target).some((key) => /household|origin/i.test(key))) {
      throw new Error("Private origin fields are forbidden");
    }
  }
  return row as InputFile;
}

async function main() {
  const inputPath = argument("input");
  if (!inputPath) throw new Error("Usage: --input=/absolute/bounded-extract.json [--apply --confirm-apply]");
  const stats = await import("node:fs/promises").then(({ stat }) => stat(inputPath));
  if (stats.size > CORRALIO_OVERTURE_STAGE1_BOUNDS.maxDownloadedBytes) {
    throw new Error("Bounded extract exceeds max_downloaded_bytes");
  }
  const input = validateInput(JSON.parse(await readFile(inputPath, "utf8")));
  assertWithinOperationalBounds({
    venues: input.targets.length,
    boxes: input.boxesUsed,
    downloadedBytes: Math.max(input.downloadedBytes, stats.size),
    candidatesExamined: input.targets.reduce((sum, target) => sum + target.places.length, 0),
    elapsedSeconds: input.elapsedSeconds,
    concurrency: 1,
  });
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes("--confirm-apply")) {
    throw new Error("Apply requires --confirm-apply; dry-run is the default");
  }
  const targets = input.targets as unknown as OvertureVenueTarget[];
  if (!apply) {
    const report = await refreshOvertureCandidatePools({} as never, {
      ...input,
      targets,
      downloadedBytes: Math.max(input.downloadedBytes, stats.size),
      dryRun: true,
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Required Supabase environment is missing");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await refreshOvertureCandidatePools(admin, {
    ...input,
    targets,
    downloadedBytes: Math.max(input.downloadedBytes, stats.size),
    dryRun: false,
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch(() => {
  console.error("Corralio Overture refresh failed");
  process.exitCode = 1;
});
