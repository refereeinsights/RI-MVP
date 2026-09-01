import { runHotelPlannerHistoricalBackfill } from "../../apps/referee/lib/hotelPlannerBookingSync";

function valueAfter(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const start = valueAfter("--start");
const end = valueAfter("--end");
const apply = process.argv.includes("--apply");
const confirmedDryRun = process.argv.includes("--confirm-dry-run");

if (!start || !end) {
  throw new Error("Usage requires --start YYYY-MM-DD --end YYYY-MM-DD");
}

const result = await runHotelPlannerHistoricalBackfill({ start, end, apply, confirmedDryRun });
process.stdout.write(`${JSON.stringify(result)}\n`);
