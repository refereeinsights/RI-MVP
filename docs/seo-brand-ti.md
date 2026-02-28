# TournamentInsights Brand SEO Checklist

## Quick checks

1. Search the brand directly
- Query: `TournamentInsights`
- Goal: homepage title and homepage result should clearly identify the brand.

2. Verify homepage title and H1
- URL: `https://www.tournamentinsights.com/`
- Confirm the page title is `TournamentInsights | Youth Sports Tournament Directory`
- Confirm the main on-page heading is literal text: `TournamentInsights`

3. Verify structured data
- Confirm homepage and `/about` include Organization JSON-LD with:
  - `@type: Organization`
  - `name: TournamentInsights`
  - `url: https://www.tournamentinsights.com`

4. Verify crawl/index files
- Check:
  - `https://www.tournamentinsights.com/robots.txt`
  - `https://www.tournamentinsights.com/sitemap.xml`
- Confirm robots allows indexing and sitemap is reachable.

5. Verify Search Console coverage
- Submit homepage and sitemap in Google Search Console.
- Request indexing for:
  - `/`
  - `/about`

## What changed

- Updated the TournamentInsights homepage metadata so the brand name is explicit in the title and description.
- Kept the homepage H1 as real text in the DOM so the brand is not only represented by an image or SVG.
- Added Organization JSON-LD to the homepage.
- Added an `/about` page as a dedicated brand/entity page for TournamentInsights.
- Extended the sitemap to include `/about`.

## Why this helps

- Brand queries work better when the homepage title, H1, canonical, and schema all reinforce the same entity name.
- A dedicated About page gives search engines a clearer brand/entity reference page.
- Valid robots and sitemap coverage improve discovery and indexing consistency.
