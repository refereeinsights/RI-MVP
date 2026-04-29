/**
 * Best-effort local dev helper.
 *
 * In the monorepo, shared SVGs live under `shared-assets/svg` and we copy them
 * into `apps/ti-web/public/svg` for local runs.
 *
 * On Vercel, the TI project root is typically `apps/ti-web`, so `../../shared-assets`
 * won’t exist in the build context. In that case, we skip copying and rely on
 * committed assets already present in `public/svg`.
 */
const fs = require("fs");
const path = require("path");

const source = path.resolve(__dirname, "..", "..", "..", "shared-assets", "svg");
const dest = path.resolve(__dirname, "..", "public", "svg");

function copyDir(src, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(src, target, { recursive: true, force: true });
}

if (!fs.existsSync(source)) {
  console.log("[ti-web] shared-assets/svg not present in this build context; skipping SVG copy");
  process.exit(0);
}

try {
  copyDir(source, dest);
  console.log(`[ti-web] Copied shared SVGs to ${dest}`);
  process.exit(0);
} catch (err) {
  console.warn("[ti-web] Failed to copy shared SVGs; continuing", err);
  process.exit(0);
}

