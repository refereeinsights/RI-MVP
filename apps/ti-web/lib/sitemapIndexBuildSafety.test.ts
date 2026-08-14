import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sitemapUnavailableResponse as riSitemapUnavailableResponse } from "../../referee/lib/sitemaps";
import { sitemapUnavailableResponse as tiSitemapUnavailableResponse } from "./sitemaps";

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
    assert.match(source, /\.error/);
    assert.match(source, /return sitemapUnavailableResponse\(\)/);
    assert.match(source, /s-maxage=3600/);
    assert.match(source, /stale-while-revalidate=86400/);
  });
}

test("TI metro sitemap keeps its database RPC out of static generation", () => {
  const source = read("apps/ti-web/app/sitemaps/metros.xml/route.ts");
  assert.match(source, /list_indexable_city_metro_hub_urls_v1/);
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /export const revalidate = 0/);
  assert.match(source, /error \|\| !Array\.isArray\(data\)/);
  assert.match(source, /return sitemapUnavailableResponse\(\)/);
  assert.match(source, /s-maxage=3600/);
  assert.match(source, /stale-while-revalidate=86400/);
});

for (const [app, createResponse] of [
  ["TI", tiSitemapUnavailableResponse],
  ["RI", riSitemapUnavailableResponse],
] as const) {
  test(`${app} sitemap failures return a retryable response that cannot be cached`, () => {
    const response = createResponse();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("retry-after"), "300");
  });
}
