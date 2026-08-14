import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

for (const routePath of [
  "apps/ti-web/app/sitemap.xml/route.ts",
  "apps/referee/app/sitemap.xml/route.ts",
]) {
  test(`${routePath} stays out of build-time static generation`, () => {
    const source = read(routePath);
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /export const revalidate = 0/);
    assert.match(source, /Promise\.all\(/);
    assert.match(source, /s-maxage=3600/);
    assert.match(source, /stale-while-revalidate=86400/);
  });
}

test("TI metro sitemap keeps its database RPC out of static generation", () => {
  const source = read("apps/ti-web/app/sitemaps/metros.xml/route.ts");
  assert.match(source, /list_indexable_city_metro_hub_urls_v1/);
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /export const revalidate = 0/);
  assert.match(source, /s-maxage=3600/);
  assert.match(source, /stale-while-revalidate=86400/);
});
