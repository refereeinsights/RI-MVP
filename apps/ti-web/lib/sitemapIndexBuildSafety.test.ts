import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sitemapUnavailableResponse as riSitemapUnavailableResponse } from "../../referee/lib/sitemaps";
import { sitemapUnavailableResponse as tiSitemapUnavailableResponse } from "./sitemaps";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

for (const [routePath, loaderName] of [
  ["apps/ti-web/app/sitemap.xml/route.ts", "getTiSitemapIndexCounts"],
  ["apps/referee/app/sitemap.xml/route.ts", "getRiSitemapIndexCounts"],
] as const) {
  test(`${routePath} stays dynamic and uses its shared cached count loader`, () => {
    const source = read(routePath);
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /export const revalidate = 0/);
    assert.match(source, new RegExp(`import \\{ ${loaderName} \\}`));
    assert.match(source, new RegExp(`await ${loaderName}\\(\\)`));
    assert.doesNotMatch(source, /supabaseAdmin/);
    assert.match(source, /return sitemapUnavailableResponse\(\)/);
    assert.match(source, /s-maxage=3600/);
    assert.match(source, /stale-while-revalidate=86400/);
  });
}

test("TI metro sitemap and SEO chips reuse the exact same exported loader", () => {
  for (const consumerPath of [
    "apps/ti-web/app/sitemaps/metros.xml/route.ts",
    "apps/ti-web/app/[sport]/[state]/_components/SeoMetroHubChips.tsx",
  ]) {
    const source = read(consumerPath);
    assert.match(source, /import \{ getTiMetroHubRows \} from "@\/lib\/sitemapData"/);
    assert.match(source, /await getTiMetroHubRows\(\)/);
    assert.doesNotMatch(source, /list_indexable_city_metro_hub_urls_v1/);
  }

  const routeSource = read("apps/ti-web/app/sitemaps/metros.xml/route.ts");
  assert.match(routeSource, /export const dynamic = "force-dynamic"/);
  assert.match(routeSource, /export const revalidate = 0/);
  assert.match(routeSource, /return sitemapUnavailableResponse\(\)/);
  assert.match(routeSource, /s-maxage=3600/);
  assert.match(routeSource, /stale-while-revalidate=86400/);
});

for (const [helperPath, namespace, version] of [
  ["apps/ti-web/lib/sitemapData.ts", "ti", "TI_SITEMAP_CACHE_VERSION"],
  ["apps/referee/lib/sitemapData.ts", "ri", "RI_SITEMAP_CACHE_VERSION"],
] as const) {
  test(`${helperPath} owns versioned database-result caches and validation`, () => {
    const source = read(helperPath);
    assert.match(source, /import \{ unstable_cache \} from "next\/cache"/);
    assert.match(source, new RegExp(`export const ${version} = "v1"`));
    assert.match(source, new RegExp(`${namespace}:sitemap:index-counts:`));
    assert.match(source, /24 \* 60 \* 60/);
    assert.match(source, /6 \* 60 \* 60/);
    assert.match(source, /returned an invalid count/);
    assert.match(source, /returned an invalid response shape/);
    assert.match(source, /returned zero rows/);
    assert.match(source, /Cache-key convention: bump/);
    assert.match(source, /tags:/);
  });
}

test("the heavy TI metro RPC exists only in the shared cached loader", () => {
  const helperSource = read("apps/ti-web/lib/sitemapData.ts");
  assert.match(helperSource, /list_indexable_city_metro_hub_urls_v1/);
});

for (const [routePath, expectedLoaders] of [
  [
    "apps/ti-web/app/sitemaps/[name]/route.ts",
    ["getTiTournamentHotelSitemapRows", "getTiTournamentSitemapRows", "getTiVenueSitemapRows"],
  ],
  [
    "apps/referee/app/sitemaps/[name]/route.ts",
    ["getRiTournamentSitemapRows", "getRiVenueSitemapRows"],
  ],
] as const) {
  test(`${routePath} keeps shard generation dynamic and caches database rows`, () => {
    const source = read(routePath);
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /export const revalidate = 0/);
    assert.match(source, /s-maxage=21600/);
    assert.match(source, /stale-while-revalidate=86400/);
    assert.match(source, /return sitemapUnavailableResponse\(\)/);
    assert.doesNotMatch(source, /supabaseAdmin/);
    for (const loaderName of expectedLoaders) {
      assert.match(source, new RegExp(`await ${loaderName}\\(`));
    }
  });
}

for (const routePath of [
  "apps/ti-web/app/sitemaps/static.xml/route.ts",
  "apps/ti-web/app/sitemaps/hubs.xml/route.ts",
  "apps/referee/app/sitemaps/static.xml/route.ts",
  "apps/referee/app/sitemaps/hubs.xml/route.ts",
]) {
  test(`${routePath} remains build-safe and uses long CDN caching`, () => {
    const source = read(routePath);
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /export const revalidate = 0/);
    assert.match(source, /s-maxage=86400/);
  });
}

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
