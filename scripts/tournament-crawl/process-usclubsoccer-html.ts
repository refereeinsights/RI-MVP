import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

import { generateSlug } from "./slug";
import type { TournamentRecord } from "./types";

function extractCityState(text: string) {
  const match = text.match(/([A-Za-z\s]+),\s*([A-Z]{2})/);
  if (match) {
    return { city: match[1].trim(), state: match[2].trim() };
  }
  return { city: null, state: null };
}

function normalizeWhitespace(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function encodeCsvValue(value: string | null | undefined) {
  const stringValue = value ?? "";
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

async function writeCsv(filePath: string, headers: string[], rows: TournamentRecord[]) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((header) => encodeCsvValue((row as Record<string, any>)[header]));
    lines.push(values.join(","));
  }
  await fs.writeFile(filePath, lines.join("\n"), "utf8");
}

type CliOptions = {
  input: string;
  sport: "soccer" | "basketball" | "football";
  level: string;
  outCsv: string;
  outJson: string;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let input = "";
  let sport: CliOptions["sport"] = "soccer";
  let level = "national";
  let outCsv = "";
  let outJson = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && args[i + 1]) {
      input = args[++i];
    } else if (arg === "--sport" && args[i + 1]) {
      const value = args[++i].toLowerCase();
      if (value === "soccer" || value === "football" || value === "basketball") {
        sport = value;
      }
    } else if (arg === "--level" && args[i + 1]) {
      level = args[++i];
    } else if (arg === "--out" && args[i + 1]) {
      outCsv = args[++i];
    } else if (arg === "--out-json" && args[i + 1]) {
      outJson = args[++i];
    }
  }

  const defaultInputPath = "/Users/roddavis/desktop/RI_MVP/tournaments/usclub.mhtml";
  if (!input) {
    input = defaultInputPath;
  }

  const resolvedInput = path.resolve(input);
  const baseName = `usclubsoccer_processed_${path.basename(resolvedInput, path.extname(resolvedInput))}.csv`;
  const resolvedOutCsv = outCsv ? path.resolve(outCsv) : path.join(path.dirname(resolvedInput), baseName);
  const resolvedOutJson = outJson ? path.resolve(outJson) : resolvedOutCsv.replace(/\.csv$/i, ".json");

  return {
    input: resolvedInput,
    sport,
    level,
    outCsv: resolvedOutCsv,
    outJson: resolvedOutJson,
  };
}

async function main() {
  const options = parseArgs();
  const html = await fs.readFile(options.input, "utf8");
  const $ = cheerio.load(html);

  const rows: TournamentRecord[] = [];

  const linkSelector = "a[href*='/tournaments/'], a[href*='/events/']";
  const seenLinks = new Set<string>();

  $(linkSelector).each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let absolute: string;
    try {
      absolute = new URL(href, "https://usclubsoccer.org/").toString();
    } catch {
      return;
    }
    if (absolute.endsWith("/list-of-sanctioned-tournaments/")) return;
    if (seenLinks.has(absolute)) return;
    seenLinks.add(absolute);

    const title = normalizeWhitespace($(element).text()) || "US Club Soccer Tournament";
    const summary = normalizeWhitespace($(element).closest("article,div").text());
    const { city, state } = extractCityState(summary);
    const slug = generateSlug(title, city, state, new Set());

    const record: TournamentRecord = {
      name: title,
      slug,
      sport: options.sport,
      level: options.level,
      state,
      city,
      venue: null,
      address: null,
      start_date: null,
      end_date: null,
      referee_pay: null,
      referee_contact: null,
      source_url: absolute,
      source_domain: new URL(absolute).hostname,
      summary: summary || null,
      status: "unconfirmed",
      confidence: null,
    };

    rows.push(record);
  });

  if (!rows.length) {
    console.warn("No tournament links found in provided HTML.");
  }

  const headers = [
    "name",
    "slug",
    "sport",
    "level",
    "state",
    "city",
    "venue",
    "address",
    "start_date",
    "end_date",
    "referee_pay",
    "referee_contact",
    "source_url",
    "source_domain",
    "summary",
    "status",
    "confidence",
  ];

  await writeCsv(options.outCsv, headers, rows);
  await fs.writeFile(options.outJson, JSON.stringify(rows, null, 2), "utf8");

  console.log(`Extracted ${rows.length} tournaments from ${options.input}`);
  console.log(`CSV written to ${options.outCsv}`);
  console.log(`JSON written to ${options.outJson}`);
}

main().catch((error) => {
  console.error("Failed to process US Club Soccer HTML:", error);
  process.exit(1);
});
