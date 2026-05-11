import fs from "node:fs";
import path from "node:path";

import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

type TournamentRow = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  start_date: string | null;
  official_website_url: string | null;
  source_url: string | null;
  updated_at: string | null;
};

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function compact(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (check .env.local).");
  }

  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "500") || 500;
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] ?? "";

  const outPath =
    outArg ||
    path.join(process.cwd(), "tmp", `pending_upload_tournaments_${todayStamp()}.csv`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("tournaments")
    .select("id,name,slug,city,state,zip,start_date,official_website_url,source_url,updated_at")
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as TournamentRow[];

  // Match admin uploads dedupe: name+city+state+start_date
  const deduped = new Map<string, TournamentRow>();
  for (const row of rows) {
    const key = [
      compact(row.name).toLowerCase(),
      compact(row.city).toLowerCase(),
      compact(row.state).toLowerCase(),
      compact(row.start_date),
    ].join("|");
    if (!deduped.has(key)) deduped.set(key, row);
  }

  const header = ["tournament_id", "tournament_name", "url", "city", "state", "zip", "start_date", "updated_at"].join(",");
  const lines = [header];

  for (const row of deduped.values()) {
    const url = compact(row.official_website_url) || compact(row.source_url);
    lines.push(
      [
        row.id,
        compact(row.name),
        url,
        compact(row.city),
        compact(row.state),
        compact(row.zip),
        compact(row.start_date),
        compact(row.updated_at),
      ].map(csvEscape).join(",")
    );
  }

  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${deduped.size} rows to ${outPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

