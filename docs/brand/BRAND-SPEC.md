# Corralio Identity — Production Specification
Convergence Dot, Version B (locked)

## Colors

| Role | Hex | Usage |
|---|---|---|
| Navy / Ink (primary) | `#16233A` | Primary mark color on light backgrounds, primary text color, app-icon tile background |
| Coral (accent) | `#CC3F2C` | The convergence dot, always. The wordmark's "i", on light backgrounds. CTAs/action color in product UI. |
| Coral tint | `#FF8A73` | The wordmark's "i" on dark backgrounds only (plain coral fails contrast against navy for fine type — use the tint instead) |
| Warm white (background) | `#F6FAF9` | Page/app background |
| Surface white | `#FFFFFF` | Cards, the light-background logo treatment |
| Teal (supporting, product UI only) | `#0B4F4A` | Product/UI accent. Not part of the logo itself. |

Contrast checked: white-on-navy 15.7:1, navy-on-warm-white 14.9:1, coral-on-warm-white 4.6:1 (fine for the small "i" accent). Coral directly on navy measures 3.2:1 — this is why the app icon uses a white ring with only the dot in coral, never a solid coral ring on navy.

## Typography

Manrope, weight 800 (ExtraBold), lowercase, letter-spacing approx -0.015em. This is the only typeface in the system. No secondary display face — the symbol carries the personality, the wordmark stays plain.

## Icon geometry (100×100 viewBox, scales proportionally)

```
<path d="M 74.52 72.08 A 33 33 0 1 1 79.66 35.53"
      fill="none" stroke-width="13" stroke-linecap="round"/>
<circle cx="80.70" cy="54.31" r="10"/>
```

- Ring radius 33, stroke 13, opening 68° total, 8° forward tilt.
- Dot radius 10, anchored at the rim (radius 31 from center), 2.3 units of clear air from each terminal — enough that the dot never touches the C ("something being eaten") and never fills enough of the opening to read as an eye or Pac-Man.
- This geometry is used unmodified from 1024px down to 16px. No simplified micro variant was needed — confirmed at true pixel size during the optical check, including at 16px.

## Clear space & minimum size

- Clear space on all sides of the full lockup: one dot-diameter (20 units in the 100-unit system).
- Minimum size, standalone mark: 16px.
- Minimum size, horizontal lockup: ~120px wide (below that the wordmark is the limiting factor, not the symbol).

## Icon-to-wordmark spacing

At a 56px icon height, the gap between the icon and the wordmark's baseline block is 16px (a ratio of ~0.29× icon height). Scale proportionally at other sizes.

## Dark/light usage rules

- **Light backgrounds:** navy `#16233A` C, coral `#CC3F2C` dot, navy or black wordmark with the "i" in coral.
- **Dark backgrounds:** white `#FFFFFF` C, coral `#CC3F2C` dot (unchanged — it's the one color that stays constant everywhere), white wordmark with the "i" in coral tint `#FF8A73`.
- **App icon specifically:** navy tile, white C, coral dot. This is the primary, tested treatment — do not substitute a solid-coral icon; it fails contrast at small sizes.
- **Monochrome:** single color (all black or all white) for both the ring and the dot, for one-color print, embossing, or watermark use.

## App icon construction

The symbol occupies ~62% of the icon canvas width, centered, on a full-bleed navy square with **no pre-rounded corners** — iOS and Android apply their own corner/mask shape, so the exported PNGs must be plain squares. This padding also keeps the mark inside Android's maskable-icon safe zone (inner 80%-diameter circle).

## File naming

See the Implementation Handoff section below.

## Implementation Handoff

### Approved production assets

Only the files directly under `apps/corralio/public/brand/` are shipping SVGs. The live-text design sources are retained outside the public tree under `docs/brand/source/` and must never be referenced by application code.

| Usage | Production asset |
|---|---|
| Full lockup on light backgrounds | `corralio-logo-horizontal.svg` |
| Full lockup on dark/navy backgrounds | `corralio-logo-horizontal-dark.svg` |
| One-color black full lockup | `corralio-logo-horizontal-mono-black.svg` |
| One-color white full lockup | `corralio-logo-horizontal-mono-white.svg` |
| Wordmark on light backgrounds | `corralio-wordmark.svg` |
| Wordmark on dark/navy backgrounds | `corralio-wordmark-dark.svg` |
| Mark on light backgrounds | `corralio-mark.svg` |
| Mark on dark/navy backgrounds | `corralio-mark-light.svg` |
| One-color black mark | `corralio-mark-mono-black.svg` |
| One-color white mark | `corralio-mark-mono-white.svg` |

All 10 production SVGs are approved for Slice 4.0C. The six wordmark-bearing assets were deterministically converted with Inkscape 1.4.4 from the retained sources using Manrope ExtraBold 800. They contain vector paths only: no live `<text>`, `<tspan>`, font reference, embedded font, raster data, script, or external dependency.

### Local font source

- Application font: `apps/corralio/app/fonts/Manrope[wght].ttf`
- Family/version: Manrope 4.504, variable weight range 200–800
- Source: the official Google Fonts `ofl/manrope` package
- Upstream commit recorded by Google Fonts: `6f81ebecdf65e4463b798cc07b16a4f8d5216917`
- License: SIL Open Font License 1.1 at `apps/corralio/app/fonts/OFL.txt`
- Supporting provenance: `FONTLOG.txt` and `METADATA.pb` in the same directory
- SHA-256: `d0639be45d0af36e798172419d7bd173c4bd4f29e2b76cbb69db1d11bf8b0a40`

Slice 4.0C must load this checked-in file with `next/font/local`; it must not use `next/font/google` or introduce a build-time font download. ExtraBold 800 is the locked wordmark weight. The approved variable file also supplies the readable product UI weights within its 200–800 range.

### Production SVG checksums

| Asset | SHA-256 |
|---|---|
| `corralio-logo-horizontal.svg` | `58f8eef0297dd7283e80242b117f8dd3cf2cd853502de28c0318ac220be2f1dd` |
| `corralio-logo-horizontal-dark.svg` | `83afa5ca4d91c3dcaad5ca01b9d11fcafd0ef5e4f6cce7b9d7ff8f450dbe4d2d` |
| `corralio-logo-horizontal-mono-black.svg` | `6d2a143d27258750fca87752f9b292e3764d456ed3cf2118c17a10b23b4dcb53` |
| `corralio-logo-horizontal-mono-white.svg` | `c276fbb6fcd19680ccc4b4b5f592e88daaa34f28f98c510e4b6d79d2e4afb007` |
| `corralio-wordmark.svg` | `3d4100f6f46ccf1261b403c3bf2c75f239fe3e1067927ccf3fbe55bc014c2095` |
| `corralio-wordmark-dark.svg` | `0322e868da697bbc5157aa4c8717f44f8d7c531f6f7ad5a11acffdd500086f9f5` |
| `corralio-mark.svg` | `554e3602cd46151a09219cd87bc894ddda6e9b82f9c056cf9eb52c4533c837dd` |
| `corralio-mark-light.svg` | `2d00617ba697bbc5157aa4c8717f44f8d7c531f6f7ad5a11acffdd500086f9f5` |
| `corralio-mark-mono-black.svg` | `5288b563cc434a64cfd6f8fd19b82b26e7b6ac885c701ffaf31b90dc6b5de8a5` |
| `corralio-mark-mono-white.svg` | `b12b1622f12890846e249142a2b170adbae2c1483858875c8397a8c54b32939b` |

The source and outlined versions produced byte-identical 1200px Inkscape PNG renders for all six converted assets. Light and dark lockups were also visually checked on warm-white and navy backgrounds at large size and at the 120px minimum width without clipping or distortion.
