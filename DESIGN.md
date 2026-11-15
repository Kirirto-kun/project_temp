# Holdline design system

White and violet, built with Emil Kowalski's design-engineering skills (installed in `.claude/skills`, pinned in `skills-lock.json`) and inspired by zimran.io: saturated violet stages, heavy grotesk type, inline media inside headlines, slanted tags and marquee ribbons. This file supersedes the visual rules in `brandbook.html`; the product, honesty and data rules there still apply.

## Tokens

All colours, shadows and curves live in `src/styles/tokens.css` and are exposed to Tailwind in `src/styles/globals.css`. Components never retype hex values.

| Role | Token | Light |
| --- | --- | --- |
| Brand | `--hold` (`--violet-600`) | `#5b42f3` |
| Page / card | `--paper` / `--raised` | white |
| Text | `--ink`, `--ink-soft`, `--muted` | violet-tinted near-black and greys |
| Money gained / left on the table | `--won` / `--gap` | green / orange, always with a word or sign |
| Accent spark | `--spark` | lime, decoration only |
| Always-dark surfaces | `--night` | same in both themes |

- Light is the default. Dark applies only when picked (`data-theme="dark"`, stored as `hl-theme`); use the `dark:` variant for overrides.
- Depth comes from semi-transparent rings and violet-tinted shadows (`--shadow-raise`, `--shadow-lift`, `--shadow-hold`), not solid borders.
- Component classes (`.btn`, `.card`, `.option`, `.input`, `.chip`, `.badge`, `.callout`…) sit in `@layer components`, so Tailwind utilities always win over them.

## Type

- Geist for everything, 700–800 with tight tracking for display (`.h-display`, `.h-section`, `.h-title`).
- One Instrument Serif italic word per large headline (`.serif`) as the accent. Never two.
- Geist Mono for labels (`.label`, `.eyebrow`) and small figures; money figures use tabular numerals.
- Do not name a class after a Tailwind utility: `.h-screen` once collided with `h-screen` (100vh) and hid every funnel screen's content.

## Motion

Values come from the skills; never invent curves.

- Curves: `--ease-out` for enter/exit and presses, `--ease-in-out` for movement on screen, `linear` for marquees, never `ease-in`.
- Buttons and pressable cards scale to 0.97 (0.985 for large cards) on `:active`, 160ms. Hover motion only inside `@media (hover: hover) and (pointer: fine)`.
- UI changes stay under 300ms (meters, track marker, steps). Accordions animate measured height (Base UI `--accordion-panel-height`). Drawers use Vaul, toasts use Sonner.
- Only `transform`, `opacity` and `clip-path` animate. Meters use `scaleX`, bars reveal with `clip-path`, markers move with `translateX`.
- One entrance per container. Staggers use shrinking gaps (for example 0, 60, 105, 135ms), never a uniform delay.
- Funnel steps slide with direction (forward to the left, back to the right); the leaving step is `inert` and `aria-hidden`.
- Chat lines already on screen at load never animate; only new ones grow from their bubble's tail.
- Delight only for rare moments: the landing entrance, the demo round, the agreement burst, the debrief bar draw and score ring.
- `prefers-reduced-motion` removes movement and keeps opacity. Loops (marquee, zigzags, demo round) stop.
- Below-the-fold reveals wait for `<InView>`; the demo round runs only while visible.

## Mobile

- `viewport-fit=cover`, safe-area padding on the header, sticky actions and the bottom sheet.
- Inputs are at least 16px; no tap highlight; controls use `touch-action: manipulation` and `user-select: none`.
- Primary actions in the funnel and the chat composer pin to the bottom on phones.
- Check new sections at 390px for horizontal overflow: grids that hold a scroller need `minmax(0,1fr)` columns.

## Libraries

Chosen with the `pick-ui-library` skill: `motion` (springs, presence, layout), `@base-ui/react` (accordion), `sonner` (toasts), `vaul` (bottom sheet), `@number-flow/react` (rolling money), `clsx` and `tailwind-merge` (`cn`).
