<!-- SEED — re-run /impeccable document once there's code to capture the actual tokens and components. -->

---
name: Bloomsbury Network Mapper
description: Fundraising intelligence platform for the Bloomsbury Football Foundation — quiet authority, black and gold.
colors:
  pitch-black: "#0d0c0a"
  deep-charcoal: "#1a1916"
  mid-charcoal: "#2e2c28"
  surface-warm: "#f5f3ef"
  surface-raised: "#ffffff"
  border-subtle: "#e8e5df"
  border-mid: "#ccc8bf"
  gold-accent: "#b8920f"
  gold-accent-light: "#d4a820"
  text-primary: "#0d0c0a"
  text-secondary: "#4a4640"
  text-muted: "#7a756c"
typography:
  display:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  none: "0"
  sm: "4px"
  md: "6px"
  lg: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.pitch-black}"
    textColor: "{colors.surface-warm}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.deep-charcoal}"
    textColor: "{colors.gold-accent-light}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-warm}"
    textColor: "{colors.pitch-black}"
---

# Design System: Bloomsbury Network Mapper

## 1. Overview

**Creative North Star: "The Intelligence Room"**

Bloomsbury Network Mapper is the tool a well-run foundation keeps off-stage. It handles sensitive financial profiles of real people, surfaces philanthropic intelligence to a fundraising team, and occasionally gets opened in a boardroom. The system must feel like a private analyst's desk: organised, precise, discreet. Not a dashboard product. Not a charity campaign. Not a startup.

The palette is drawn directly from Bloomsbury Football's own identity: near-black and restrained gold. Used in an operations tool, these colours carry quiet authority rather than the wealth-flex associations they would carry on a fintech product. Black is the primary surface at rest; gold is reserved for a small number of meaningful signals. Warm off-white backgrounds replace pure white to keep the interface from reading as cold or clinical.

The typography is a single humanist sans at multiple weights. Dense information — scores, sources, provenance — needs a typeface that holds legibility at small sizes without feeling mechanical. No serifs in the UI; this is a daily operations tool, not an annual report. All-caps labels with tight tracking are used sparingly, for metadata and category tags only.

This system explicitly rejects: AI startup glassmorphism, gradient hero sections, charity-sector sentiment ("donate-button red", ribbon iconography), and crypto/neon-on-black aesthetic. It also rejects sentimental copy and decorative motion. Every element earns its place by serving the workflow.

**Key Characteristics:**
- Near-black surfaces with warm off-white content areas
- Gold as a signal colour only — never decorative
- Single sans-serif, variable weight, data-density-optimised
- Flat by default; borders and tonal layering for depth, not shadows
- Provenance inline, always — every enriched value carries its source
- Plain British English voice; no exclamation marks, no softening language

## 2. Colors

The palette is Bloomsbury's identity colours applied to an ops tool: pitch-black and a single restrained gold, set against warm off-white surfaces.

### Primary
- **Pitch Black** (#0d0c0a): Primary surface for navigation, sidebars, and the app shell. Warm-tinted near-black — never pure `#000`. The ground from which everything else reads.
- **Gold Accent** (#b8920f): The one voice. Used on scores above a threshold, active states, primary CTAs on dark backgrounds, and key trigger signals. Rarity is the point — if it appears on more than 10% of any screen, it has lost its meaning.

### Secondary
- **Gold Accent Light** (#d4a820): Hover state of gold interactive elements on dark backgrounds. Slightly brighter, same hue family. Not used independently.

### Neutral
- **Deep Charcoal** (#1a1916): Secondary dark surface — active nav items, elevated panels within the dark shell, sidebar hover.
- **Mid Charcoal** (#2e2c28): Dividers and borders within dark surfaces.
- **Surface Warm** (#f5f3ef): Primary content background. Warm-tinted off-white, never pure white. Pipeline rows, cards, side panels.
- **Surface Raised** (#ffffff): Raised content surfaces — modal backgrounds, selected row highlight, input fields.
- **Border Subtle** (#e8e5df): Dividers and separators on warm surfaces.
- **Border Mid** (#ccc8bf): Stronger borders — table column separators, focused input outlines.
- **Text Primary** (#0d0c0a): Body text on warm surfaces. Same hue as Pitch Black.
- **Text Secondary** (#4a4640): Supporting text — field labels, column headers, metadata.
- **Text Muted** (#7a756c): De-emphasised text — timestamps, provenance source URLs, empty-state supporting copy.

### Named Rules
**The One Voice Rule.** Gold (#b8920f) appears on ≤10% of any given screen. Its scarcity is what makes it readable as a signal. The moment it becomes wallpaper, it stops meaning anything.

**The No Pure White Rule.** Neither `#ffffff` (as a background) nor `#000000` appears anywhere. Every neutral is tinted toward the warm brown-black hue family at chroma 0.005–0.01.

## 3. Typography

**Body Font:** Inter (with system-ui, sans-serif fallback)

No display or decorative typeface. Inter at varying weights is the entire system. Its humanist construction keeps it legible at 12–14px — where provenance metadata, score labels, and source URLs actually live in this tool.

**Character:** Quiet and functional. Weight contrast (400 → 700) carries hierarchy without a second typeface. Tight negative tracking on headings (-0.02em) keeps display text from floating; label text uses positive tracking (+0.04em) at small sizes for legibility.

### Hierarchy
- **Display** (700, clamp(1.75rem–2.5rem), 1.1lh): Page titles and empty-state headings only. Used once per view.
- **Headline** (600, 1.25rem, 1.25lh): Section headings, panel titles, sponsor record names. -0.01em tracking.
- **Title** (500, 0.9375rem, 1.4lh): Table column headers, card titles, sub-section labels.
- **Body** (400, 0.875rem, 1.6lh): All paragraph text, list items, lead descriptions. Max line length 65ch.
- **Label** (500, 0.75rem, 1.3lh, +0.04em): Metadata tags, category chips, provenance source labels, score breakdown labels. All-caps only for true category tags; mixed-case for running label text.

### Named Rules
**The No Serif Rule.** No serif typefaces anywhere in the interface. Serifs belong in reports and annual reviews. This is a daily ops tool.

**The Tracking Rule.** Positive letter-spacing (+0.04em or above) is reserved for labels at ≤0.75rem. Larger text tracks at 0 or negative. Tight tracking on large text; open tracking on small text. Never the reverse.

## 4. Elevation

This system is flat by default. Surfaces are distinguished by background colour and border — not by drop shadows. The dark shell (Pitch Black, Deep Charcoal) and the warm content area (Surface Warm, Surface Raised) create a natural two-layer ground without needing shadow tokens.

Shadows are reserved for one case: floating elements that must read as above the content plane (tooltips, dropdowns, command palettes). Even there, shadows are tight and dark — never diffuse glows.

### Shadow Vocabulary
- **Floating** (`0 2px 8px rgba(13, 12, 10, 0.18), 0 0 1px rgba(13, 12, 10, 0.12)`): Dropdowns, tooltips, floating panels. The only shadow in the system.

### Named Rules
**The Flat-By-Default Rule.** Surfaces at rest have no shadow. Depth is communicated by colour contrast between the dark shell and the warm content area. Shadows only appear when an element physically floats above the content plane.

**The No Glow Rule.** No diffuse glows, blur-based halos, or glass effects. If it looks like a 2023 AI product landing page, it has failed.

## 5. Components

### Buttons
Buttons are compact, sharp-cornered, and direct. No rounded-pill shapes. Labels are sentence-case, never all-caps (except for category tags elsewhere in the system).

- **Shape:** Sharp (4px radius)
- **Primary (on light surface):** Pitch Black background (#0d0c0a), warm off-white text (#f5f3ef), 10px/20px padding. Hover: Deep Charcoal (#1a1916) with Gold Accent text (#d4a820). Transition: background 150ms ease-out.
- **Primary (on dark surface):** Gold Accent background (#b8920f), Pitch Black text (#0d0c0a). Hover: Gold Accent Light (#d4a820). Used for the single primary CTA within the dark shell only.
- **Ghost:** Transparent background, Text Primary colour, 1px Border Mid border. Hover: Surface Warm background. Used for secondary actions adjacent to a primary button.
- **Destructive:** Surface Warm background at rest, Text Secondary label. On hover: `#fef2f2` background, deep red text (`#7f1d1d`). No red at rest — destructive actions should not be visually alarming until interaction.

### Chips / Tags
Used for status labels, score bands, network distance, and filter pills.

- **Style:** Surface Warm background (#f5f3ef), Text Secondary text (#4a4640), 1px Border Subtle border, 4px radius.
- **Active / selected:** Pitch Black background, Surface Warm text. Gold Accent left-border 2px is the one exception to the no-side-stripe rule — reserved specifically for lead score tier badges (High / Medium / Low), never decorative cards.
- **Score tier badge:** Gold Accent (#b8920f) background, Pitch Black text — reserved for High score signals only. One per screen maximum.

### Cards / Containers
Cards are used only where a true container affordance is needed — sponsor records, lead profile panels. Not for decorative grouping.

- **Corner Style:** 6px radius
- **Background:** Surface Warm (#f5f3ef) — content rows; Surface Raised (#ffffff) — selected/focused rows, floating panels
- **Shadow Strategy:** None at rest (see Elevation). Floating only when the panel lifts above the content plane.
- **Border:** 1px Border Subtle (#e8e5df) at rest; 1px Border Mid (#ccc8bf) on hover or focus
- **Internal Padding:** 16px standard; 24px for primary record panels

### Inputs / Fields
- **Style:** Surface Raised (#ffffff) background, 1px Border Mid (#ccc8bf) stroke, 6px radius
- **Focus:** 2px Border Mid outline — no coloured glow, no gold. Focus is structural, not decorative.
- **Placeholder:** Text Muted (#7a756c)
- **Error:** Border shifts to `#b91c1c`; error message in Text Muted size, red `#7f1d1d` colour
- **Disabled:** Surface Warm background, Text Muted text, no border

### Navigation (Dark Shell)
The primary navigation lives in a Pitch Black (#0d0c0a) sidebar or top bar. This is the persistent app shell — always dark, always anchoring.

- **Default nav item:** Text Muted (#7a756c) label, no background
- **Hover:** Deep Charcoal (#1a1916) background, Text Secondary (#4a4640) label
- **Active:** Deep Charcoal background, Surface Warm (#f5f3ef) label, Gold Accent 2px left-border — the one place a side stripe is warranted, because it is the structural affordance of "you are here" in a dark sidebar
- **Typography:** Label scale (0.75rem, 500 weight, +0.04em tracking) for nav items

### Provenance Tags (Signature Component)
Every enriched data field carries a provenance tag inline — source name and retrieval date. This is a first-class design element, not a tooltip or settings panel.

- **Style:** Label scale, Text Muted colour, preceded by a small external-link icon inline. Not in a pill or chip — plain inline text, visually subordinate but always present.
- **Format:** `Source · DD Mon YYYY` — e.g. `Companies House · 14 Mar 2025`
- **Rule:** If a provenance tag cannot be shown, the enriched value is not shown.

### Score Indicators
Lead scores are paired with their top three reasons at all times.

- **High (≥75):** Gold Accent chip (#b8920f bg, #0d0c0a text), score number in Headline weight
- **Medium (40–74):** Surface Warm chip with Text Secondary label
- **Low (<40):** Surface Warm chip with Text Muted label
- **Reasons:** Three bullet points in Body scale directly beneath the score chip, always visible in the triage side panel — never behind a "show more"

## 6. Do's and Don'ts

### Do:
- **Do** use Pitch Black (#0d0c0a) for the app shell and navigation — it is the ground.
- **Do** reserve Gold Accent (#b8920f) for signals: high-score leads, active nav state, primary CTA on dark surfaces. If it appears on more than 10% of a screen, remove it.
- **Do** show provenance inline on every enriched value — source name and retrieval date, always visible, never on hover.
- **Do** pair every score with its top three reasons in plain English. "High philanthropic signal — recent trustee appointment at Shelter, £250k donation record, shared network with Patron A." That is the whole point of the recommender.
- **Do** use sentence-case on all buttons, headings, and body copy. All-caps is for Label-scale metadata tags only.
- **Do** keep body line lengths at 65ch maximum in reading contexts (lead descriptions, provenance notes).
- **Do** use the two-layer model (dark shell + warm content area) before reaching for shadows or cards.
- **Do** test every surface against the question: "Would I be comfortable showing this in a board meeting?" If not, revise.

### Don't:
- **Don't** use glassmorphism, gradient meshes, blurred backgrounds, or any `backdrop-filter` effects. These are the "AI did this" giveaway, and they are incompatible with the serious character of a tool that profiles real people's finances.
- **Don't** use gradient text (`background-clip: text`). Use solid colour. Emphasis via weight, not gradient.
- **Don't** use donate-button red, ribbon iconography, sentimental copy ("we're transforming lives!"), or any visual language from a public-facing charity campaign. This is a staff operations tool.
- **Don't** use neon-on-black, gold glows, or any visual language associated with crypto, wealth management, or fintech luxury. The foundation profiles private individuals' financial data — "unlock the network" energy is reputationally dangerous.
- **Don't** use `#000000` or `#ffffff` as background colours. Tint every neutral.
- **Don't** use `border-left` greater than 1px as a coloured decorative stripe on cards, callouts, or list items. The single exception is the active nav item in the dark sidebar and the score-tier badge — both structural, never decorative.
- **Don't** put score reasons, provenance sources, or confidence notes behind a "show more" toggle in triage views. The information is why the tool exists; hiding it defeats the purpose.
- **Don't** use exclamation marks, softening phrases ("we didn't find anything yet!"), or informal contractions in UI copy. Plain professional British English only.
- **Don't** animate layout properties. Transitions are for opacity, colour, and transform only.
- **Don't** use modal dialogs as the first response to a user action. Exhaust inline and progressive disclosure alternatives first.
- **Don't** use identical card grids (icon + heading + text, repeated). If you find yourself building a grid of same-sized cards, reconsider the layout.
