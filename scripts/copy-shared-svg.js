/**
 * Copies shared SVG assets into each app's public directory.
 * Keeps a single source of truth under shared-assets/svg.
 */
const fs = require("fs");
const path = require("path");

const source = path.resolve(__dirname, "..", "shared-assets", "svg");
const targets = [
  path.resolve(__dirname, "..", "apps", "corp", "public", "svg"),
  path.resolve(__dirname, "..", "apps", "ti-web", "public", "svg"),
  path.resolve(__dirname, "..", "apps", "referee", "public", "svg"),
];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

if (!fs.existsSync(source)) {
  console.error("Shared SVG source not found:", source);
  process.exit(1);
}

for (const target of targets) {
  copyDir(source, target);
  console.log(`Copied shared SVGs to ${target}`);
}
