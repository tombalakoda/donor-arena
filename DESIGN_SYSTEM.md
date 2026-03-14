# Design System: Arena2
Last updated: 2026-03-14

## Visual Personality
A bright, frost-covered arena with Ottoman grandeur woven into the UI. The base is icy and luminous — pale blues, whites, crystalline highlights — while buttons, borders, and accents carry the richness of Turkish minyatür through gold leaf, deep lapis blue, and occasional ruby touches. The tone is competitive and sharp, with just enough ornamental flair to feel distinctive.

## Colour Palette
| Token Name         | Hex Value | Usage |
|--------------------|-----------|-------|
| background         | #E8F0F8   | Pale frost — main page/screen background |
| surface            | #F4F8FC   | Brighter ice — cards, panels, modals |
| ice-accent         | #B8D8EB   | Frozen highlight — borders, dividers, subtle UI frames |
| primary            | #1B4D8A   | Deep lapis blue — buttons, headings, key actions |
| secondary          | #C8963E   | Burnished gold — ornamental accents, highlights, rank badges |
| text-light         | #FFFFFF   | White — default in-game text (with black stroke) |
| text-primary       | #1A2A3A   | Near-black with cold tint — DOM/HTML elements only |
| text-secondary     | #5A7A8A   | Muted steel — DOM captions, labels |
| border             | #A8C8DC   | Soft ice edge — input outlines, dividers |
| danger             | #B83A3A   | Ottoman ruby — errors, elimination, destructive actions |
| success            | #3A8A5A   | Jade green — confirmations, health, positive states |

## Typography
Universal font: Press Start 2P (Google Fonts) — pixel aesthetic across ALL screens and text.
No secondary font — Press Start 2P is used for headings, body, labels, and HUD alike.

| Name    | Font            | Size  | Weight | Usage |
|---------|-----------------|-------|--------|-------|
| H1      | Press Start 2P  | 24px  | 400    | Screen titles |
| H2      | Press Start 2P  | 16px  | 400    | Section titles |
| H3      | Press Start 2P  | 12px  | 400    | Card titles, labels |
| Body    | Press Start 2P  | 10px  | 400    | Descriptions, tooltips |
| Small   | Press Start 2P  | 8px   | 400    | Captions, tips, fine print |

## Text Color & Readability
Default text style: **white (#FFFFFF)** with **black (#000000) stroke** (thickness 4px).
This ensures readability over any background — painted scenes, dark panels, icy surfaces.
Dark text (#1A2A3A) is only used for DOM elements (HTML inputs) outside the Phaser canvas.

## Spacing Scale
xs: 4px | sm: 8px | md: 16px | lg: 24px | xl: 32px | 2xl: 48px | 3xl: 64px

## Border Radius
Default: 4px — subtle, sharp-leaning, competitive feel (buttons, cards, inputs)
Large: 8px — modals, panels
Pill: 9999px — tags, badges, round indicators

## Shadows
Subtle: 0 2px 8px rgba(27, 77, 138, 0.08) — cards, panels
Medium: 0 4px 16px rgba(27, 77, 138, 0.12) — dropdowns, popovers
Strong: 0 8px 32px rgba(27, 77, 138, 0.18) — modals, overlays
(All shadows blue-tinted to feel icy)

## Component Defaults
Button: height 40px, padding 0 16px, 4px radius, lapis primary bg, gold hover glow
Input: height 40px, padding 0 12px, ice-accent border
Card/Panel: padding 24px, surface background, ice-accent border, 4px radius
Modal: max-width 560px, padding 32px, 8px radius

## Ornamental Notes
Ottoman minyatür motifs (geometric tile borders, arabesque corner flourishes) should be implemented as pixel-art sprite/image assets rather than CSS, to stay in the game's visual language. Use sparingly on panel borders and screen frames.

## Reference Inspirations
- Turkish minyatür (miniature painting) — jewel tones, ornamental gold, geometric patterns
- Exit the Gungeon — bold pixel-art UI, punchy elements, competitive energy
- Ice rink / frozen lake — bright, luminous, crystalline
