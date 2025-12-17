import { setTimeout as delay } from "node:timers/promises";

import type { RunContext } from "./types";
import { appendRunLog } from "./storage";

const MIN_DELAY_MS = 3000;
const MAX_DELAY_MS = 8000;
const MAX_RETRIES = 3;

function randomizedDelay() {
  const jitter = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return delay(jitter);
}

export async function fetchHtml(
  url: string,
  ctx: RunContext
): Promise<string> {
  await randomizedDelay();
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_RETRIES) {
    try {
      attempt += 1;
      appendRunLog(ctx, `Fetching ${url} (attempt ${attempt})`);
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "RI-MVP-Crawler/1.0 (+https://www.refereeinsights.com/about)",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      appendRunLog(ctx, `Fetch failed for ${url}: ${(error as Error).message}`);
      if (attempt < MAX_RETRIES) {
        await delay(1000 * attempt);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch ${url}`);
}
