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
