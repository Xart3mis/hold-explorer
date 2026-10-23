---
name: Hold Explorer
description: A ruled register for piping holds. Teal on tinted neutrals, dark by default, with a light theme designed on its own.
---

# Design System: Hold Explorer

This file is the visual specification of Hold Explorer. `PRODUCT.md` says who uses the app and why; this file says how it looks.

**The token tables are the source of truth.** Every color, size, and duration a component uses is a token in a table below. Interface code uses no literal color, size, or duration. The front matter above carries only the name and description on purpose: the tables hold two themes and two densities, which the front matter format cannot, and one source is better than two.

**How the tables are read by tools.** A token table is a Markdown table whose first header cell is `Token`. The first cell of each row is a CSS custom property name. Columns named `Dark` and `Light` hold themed values, `Comfortable` and `Compact` hold density values, `Value` holds the rest, and `Use` is prose. A value may refer to another token with `var()`. Three more tables are read by their first header cell: `Foreground` (the contrast pairs), `Fill` (what each fill may carry: chart marks, a primary button), and `Role` (the letter spacing and figure style of each text role). `node tools/design/check-tokens.mjs` checks the tables; `node tools/design/check-tokens.mjs --css` prints the tokens as CSS custom properties.

## 1. Overview

**Creative North Star: "The Ruled Register"**

Engineering projects run on registers: the line list, the hold register, the document register. A good register is ruled, aligned, and quiet. Figures sit in columns, every row has the same height, and one ink marks what matters today. Hold Explorer is that register on a screen. Rows are separated by hairlines, numbers align on tabular figures, line IDs sit in a monospace column, and a single teal marks the primary action, the current selection, focus, and the progress of something the user started. Everything else is tinted neutral, the plain single-series bars included.

The register is **product**, the color strategy is **Restrained**, and density is **hybrid**: Overview and History are roomy enough to read from across a meeting room; Lines, Breakdown, and Blockers are tables first, as dense as the user chooses.

**Why dark by default, and why the light theme is its own design.** The theme follows the two scenes of `PRODUCT.md`, not the category.

- *The desk:* a piping engineer has the 3D plant model open on a dark canvas for hours and glances across to Hold Explorer on the second monitor between modeling sessions. A dark interface keeps both monitors at the same brightness, so the eye does not re-adapt on every glance. That scene is the daily one, so dark is the default.
- *The meeting room:* a lead shows Overview on a wall screen with the blinds half open, read from four meters away. A projector in a lit room washes out the low-contrast layers a dark interface depends on. The light theme is built for that screen: near-white paper, dark ink, stronger hairlines, and shadows instead of lightness steps for depth.

The two themes share hues, type, spacing, and component anatomy. They do not share lightness logic: in dark, a higher surface is lighter and fields are sunken; in light, a higher surface is brighter paper with a shadow and fields are the brightest thing on the page.

This system rejects what `PRODUCT.md` lists as anti-references: the startup analytics dashboard, the dark "AI tool" skin, the CAD or control-room console, the old single-file tool, and the enterprise form from 2010.

**Key Characteristics:**

- One accent, teal, on at most a tenth of any screen. Its rarity is what makes a selection visible.
- Teal means interactive: the primary action, the selection, focus, a link, and the progress of an action the user started. Plain data is neutral gray, and a ramp is blue.
- Neutrals tinted toward the accent hue. No pure black, no pure white, no untinted gray.
- Four type sizes, each at least 1.25 times the one below. Hierarchy inside a size comes from weight and ink.
- Hairlines and surface steps before boxes. Flat at rest; shadows only on what floats.
- Round means filter, square means action: a filter chip is a pill, and every other control has a 4 px corner. Nothing else is a pill. Four small things are round without being one, each for a reason of its own: the circle of a radio and of the single-choice mark of an option list, so that neither can be taken for a checkbox; the remove circle of a filter chip, which is the end of its pill; the progress track, which is a line with round ends and not a control; and the spinner, which is a ring because it turns.
- Every state is specified: default, hover, focus, active, disabled, loading, error.
- Motion marks a state change, lasts 150 to 250 ms, and disappears under reduced motion.

## 2. Colors

A cool, low-chroma neutral scale carries the interface; a petrol teal marks action, selection, focus, and the progress of an action the user started; four state colors and a chart palette appear only where they carry meaning.

All colors are OKLCH: `oklch(lightness chroma hue)`, lightness from 0 to 1. Every value lies inside the sRGB gamut, so every screen paints the same color the checker measured.

### Hue anchors

The accent hue, the neutral tint, and the hue of the chart ramps are each set in one place. Every accent step, every neutral, and every ramp step refers to its anchor. After changing an anchor, run `node tools/design/check-tokens.mjs`: the maximum chroma inside sRGB differs by hue, and the checker reports any value that leaves the gamut or drops below its contrast minimum.

| Token | Value | Use |
|---|---|---|
| `--hue-accent` | `200` | Hue of every accent step and of the focus ring. |
| `--hue-neutral` | `200` | Hue toward which every neutral is tinted: surfaces, borders, text, and the neutral data marks. |
| `--hue-ramp` | `250` | Hue of the two chart ramps: the heatmap steps and the age bands. |

Two rules bind the hues, and the checker enforces both.

- **The excluded range.** No hue anchor and no color in this file has a hue from 270 to 350 degrees, both ends included. That range holds violet, indigo, purple, and magenta. Blue (250 for the ramps, 258 for info, 262 for the first series slot) lies below it and rose (5) above it.
- **The teal reserve.** Only the accent tokens (`--color-accent` and its steps, `--color-focus-ring`, `--color-text-on-accent`) may have a hue within 25 degrees of `--hue-accent`. A color with a chroma under 0.04 is a tinted neutral and is exempt. So no state color, no chart mark, and no ramp step can be taken for the accent.

### The accent: direction chosen by the owner, steps chosen by design

**The direction is the owner's decision: teal, a blue-green.** A purple, violet, indigo, or magenta accent was ruled out by the owner and must not return, in the accent or in the neutral tint.

**The owner's choice overrides the design skill's reflex test.** That test rejects an accent that anyone could guess from the category, and teal is one of the guessable answers for an engineering tool. The test was run and it rejected teal. The owner chose teal knowing this, and the decision stands: do not reopen it on the strength of the test. What the test protects, an interface that does not look like every other tool in its category, is carried by the rest of this file: the ruled layout, the neutral data, the two typefaces, and the rule that teal is spent only on interaction.

**The steps are design decisions, for these reasons:**

- **Hue 200.** The state colors sit at hue 27 (danger), 70 to 85 (warning), 140 (success), and 258 (info). Hue 200 is 60 degrees from success and 58 degrees from info, the midpoint of the gap between them, so a selection cannot be read as "released" or as "information". Success was moved from the usual green (about 150) to a yellower green at 140 to open that gap, and info was set at a clear blue (258) and not a cyan-blue. The chart colors nearest to the accent, jade at 165 and sky at 230, stay 30 degrees or more away.
- **Calm chroma.** The chroma of the fills and inks stays between 0.06 and 0.11, and the selection tints are lower still. Teal at these lightness levels cannot be more saturated inside sRGB anyway, and a petrol teal beside tables of numbers all day should read as ink, not as a highlight pen.
- **Dark theme: a deep fill, not a bright one.** The primary button is a deep petrol (lightness 0.50) with near-white text, not a bright aqua with dark text. A bright fill would be the lightest object on a dark screen and pull the eye from the table. At 0.50 the fill clears 3:1 against the app and panel surfaces and its label clears 4.5:1. Hover goes lighter (0.545), the direction that reads as "lit" on a dark surface; it stops there because that is the last step at which the label still clears 4.5:1. The pressed step goes darker (0.46) and so falls under 3:1 against those surfaces: 2.80 on the app surface and 2.65 on the panel. The 3:1 claim for the primary fill therefore holds at rest and on hover. The pressed state lasts only as long as the press, and the label, at 6.56:1, carries the button through it. A pressed step that cleared 3:1 would have to sit between the rest and hover steps, where a press could not be told from either. The pressed fill is still checked, against a minimum of 2.5, so that it cannot erode further.
- **Light theme: one step does both jobs.** At lightness 0.47 the accent is dark enough to carry near-white text as a fill (6.3:1) and to be read as ink on every light surface, so `--color-accent` and `--color-accent-text` have the same value. Hover and active go darker.
- **Accent as ink is a separate token.** On dark surfaces a deep fill cannot be read as text, so `--color-accent-text` is a light teal (0.80) for links, the selected tab indicator, and the border of a checked checkbox. A checked checkbox carries that border because the deep fill alone is under 3:1 on raised and overlay surfaces.
- **Selection is a tint, not a fill.** `--color-accent-subtle` is a low-chroma teal wash under the selected row, the current sidebar item, and an active filter chip. Primary, secondary, and muted text all clear 4.5:1 on it and on its hover step.
- **Neutrals lean the same way.** Every neutral carries a chroma of 0.002 to 0.022 at the neutral hue. It is too little to read as "teal gray", and enough that the accent looks like it belongs to the surfaces.

### Surfaces

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-surface-app` | `oklch(0.170 0.008 var(--hue-neutral))` | `oklch(0.985 0.003 var(--hue-neutral))` | Window background and the content area. |
| `--color-surface-panel` | `oklch(0.200 0.010 var(--hue-neutral))` | `oklch(0.963 0.006 var(--hue-neutral))` | Chrome: top bar, sidebar, detail panel, filter bar. |
| `--color-surface-raised` | `oklch(0.230 0.011 var(--hue-neutral))` | `oklch(0.996 0.002 var(--hue-neutral))` | A plane that sits on the content area: table header, stat tile group, page-level toolbars. |
| `--color-surface-overlay` | `oklch(0.262 0.012 var(--hue-neutral))` | `oklch(0.996 0.002 var(--hue-neutral))` | Anything that floats: menus, popovers, toasts, command palette. |
| `--color-surface-field` | `oklch(0.148 0.007 var(--hue-neutral))` | `oklch(0.996 0.002 var(--hue-neutral))` | Inside of text fields, selects, and unchecked checkboxes. Sunken in dark, paper-bright in light. |
| `--color-surface-hover` | `oklch(0.245 0.013 var(--hue-neutral))` | `oklch(0.940 0.008 var(--hue-neutral))` | Hover fill for rows, sidebar items, quiet and secondary buttons on app, panel, and raised surfaces. |
| `--color-surface-pressed` | `oklch(0.275 0.014 var(--hue-neutral))` | `oklch(0.915 0.010 var(--hue-neutral))` | Pressed fill for the same elements. Also the value of `--color-chart-band`. |
| `--color-surface-overlay-hover` | `oklch(0.305 0.014 var(--hue-neutral))` | `oklch(0.950 0.007 var(--hue-neutral))` | Hover and keyboard-highlight fill for items inside an overlay. |
| `--color-surface-disabled` | `oklch(0.215 0.006 var(--hue-neutral))` | `oklch(0.950 0.004 var(--hue-neutral))` | Fill of a disabled control. |
| `--color-skeleton` | `oklch(0.300 0.012 var(--hue-neutral))` | `oklch(0.915 0.009 var(--hue-neutral))` | Skeleton blocks during a first load. Visible on the app, panel, and raised surfaces. |
| `--color-scrim` | `oklch(0.100 0.010 var(--hue-neutral) / 0.6)` | `oklch(0.250 0.020 var(--hue-neutral) / 0.4)` | Veil behind the command palette and the shortcut sheet. The one translucent color. |

### Borders

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-border-subtle` | `oklch(0.262 0.010 var(--hue-neutral))` | `oklch(0.925 0.006 var(--hue-neutral))` | Row dividers, gridlines inside a container. Decorative; no contrast minimum. |
| `--color-border-default` | `oklch(0.320 0.012 var(--hue-neutral))` | `oklch(0.870 0.010 var(--hue-neutral))` | Edges of regions and containers: sidebar edge, panel edge, tile group, menus, toasts, tags. |
| `--color-border-strong` | `oklch(0.560 0.016 var(--hue-neutral))` | `oklch(0.590 0.018 var(--hue-neutral))` | Boundary of an interactive control: field, select, checkbox, secondary button. At least 3:1 on every surface a control sits on. |

### Text

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-text-primary` | `oklch(0.935 0.008 var(--hue-neutral))` | `oklch(0.250 0.020 var(--hue-neutral))` | Values, headings, body text, labels of the current item. |
| `--color-text-secondary` | `oklch(0.790 0.012 var(--hue-neutral))` | `oklch(0.420 0.022 var(--hue-neutral))` | Supporting text: column headers, field labels, unselected navigation, descriptions. |
| `--color-text-muted` | `oklch(0.700 0.014 var(--hue-neutral))` | `oklch(0.490 0.020 var(--hue-neutral))` | Captions, placeholders, units, timestamps, the Soon tag. Still at least 4.5:1. |
| `--color-text-disabled` | `oklch(0.500 0.010 var(--hue-neutral))` | `oklch(0.680 0.012 var(--hue-neutral))` | Label of a disabled control. Exempt from the contrast minimum, as WCAG exempts inactive controls. |
| `--color-text-on-accent` | `oklch(0.985 0.010 var(--hue-accent))` | `oklch(0.985 0.008 var(--hue-accent))` | Text and icons on an accent fill. |

### Primary: the accent

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-accent` | `oklch(0.500 0.085 var(--hue-accent))` | `oklch(0.470 0.079 var(--hue-accent))` | Fill of the primary button and of a checked checkbox. |
| `--color-accent-hover` | `oklch(0.545 0.092 var(--hue-accent))` | `oklch(0.420 0.070 var(--hue-accent))` | Hover step of the accent fill: lighter in dark, darker in light. |
| `--color-accent-active` | `oklch(0.460 0.077 var(--hue-accent))` | `oklch(0.370 0.062 var(--hue-accent))` | Pressed step of the accent fill. |
| `--color-accent-subtle` | `oklch(0.285 0.040 var(--hue-accent))` | `oklch(0.945 0.025 var(--hue-accent))` | Background of the current selection: selected row, current sidebar item, active filter chip. |
| `--color-accent-subtle-hover` | `oklch(0.320 0.046 var(--hue-accent))` | `oklch(0.915 0.034 var(--hue-accent))` | Hover over a selected element. |
| `--color-accent-open` | `oklch(0.305 0.050 var(--hue-accent))` | `oklch(0.912 0.044 var(--hue-accent))` | A deeper tint for the open row of a table among other selected rows (owner, 2026-10-19). |
| `--color-accent-open-hover` | `oklch(0.328 0.052 var(--hue-accent))` | `oklch(0.895 0.048 var(--hue-accent))` | Hover over the open row among other selected rows. |
| `--color-accent-border` | `oklch(0.440 0.070 var(--hue-accent))` | `oklch(0.800 0.055 var(--hue-accent))` | Hairline around an accent-subtle element such as an active filter chip. Decorative. |
| `--color-accent-text` | `oklch(0.800 0.090 var(--hue-accent))` | `oklch(0.470 0.079 var(--hue-accent))` | Accent as ink on a surface: links, the selected tab indicator, the border of a checked checkbox, the active drop zone, the fill of the progress bar. |
| `--color-focus-ring` | `oklch(0.820 0.110 var(--hue-accent))` | `oklch(0.520 0.087 var(--hue-accent))` | The keyboard focus ring, on every focusable element. |

### State colors

Each state has a text step (text, icon, and control border; at least 4.5:1 on every surface it appears on), a subtle background, and a decorative border. A state is never shown by color alone: it always has an icon and a label.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-danger-text` | `oklch(0.760 0.130 27)` | `oklch(0.500 0.180 27)` | Text, icon, and control border for errors and destructive actions. |
| `--color-danger-subtle` | `oklch(0.270 0.050 27)` | `oklch(0.950 0.022 27)` | Background of a danger notice or tag. |
| `--color-danger-border` | `oklch(0.420 0.090 27)` | `oklch(0.820 0.070 27)` | Hairline around a danger notice or tag. Decorative. |
| `--color-warning-text` | `oklch(0.820 0.120 80)` | `oklch(0.490 0.100 70)` | Text and icon for warnings: stale holds, import warnings, and a limited file on the import review, where the user decides whether to import it. Once imported, a limited snapshot is a standing fact and not something to act on: Overview says it in an info notice. |
| `--color-warning-subtle` | `oklch(0.275 0.045 80)` | `oklch(0.955 0.035 85)` | Background of a warning notice or tag. |
| `--color-warning-border` | `oklch(0.430 0.070 80)` | `oklch(0.830 0.090 80)` | Hairline around a warning notice or tag. Decorative. |
| `--color-success-text` | `oklch(0.800 0.150 140)` | `oklch(0.470 0.130 140)` | Text and icon for success: import complete, hold released. |
| `--color-success-subtle` | `oklch(0.265 0.050 140)` | `oklch(0.950 0.040 140)` | Background of a success notice or tag. |
| `--color-success-border` | `oklch(0.420 0.080 140)` | `oklch(0.820 0.090 140)` | Hairline around a success notice or tag. Decorative. |
| `--color-info-text` | `oklch(0.780 0.100 258)` | `oklch(0.480 0.150 258)` | Text and icon for neutral information: an older snapshot in view, an update is available. |
| `--color-info-subtle` | `oklch(0.270 0.045 258)` | `oklch(0.950 0.022 258)` | Background of an info notice or tag. |
| `--color-info-border` | `oklch(0.420 0.080 258)` | `oklch(0.820 0.060 258)` | Hairline around an info notice or tag. Decorative. |

### Chart palette

Charts are the only place a fuller palette appears, and every color in a chart does one job. Who wears what:

- **Teal is interaction, never data.** Teal belongs to the accent tokens: the primary action, the current selection, focus, links, and progress. No chart mark, ramp step, or status mark is teal. A bar row that is in the active filter gets the teal selection tint because it is selected; its bar stays neutral.
- **Neutral gray is plain data.** A chart with one series has nothing to tell apart, so it uses no hue. Bars by discipline, by hold type, by role, the top blockers, and the open-holds trend are drawn in `--color-chart-neutral`. Length carries the value and the label carries the name.
- **Blue is magnitude and order.** The heatmap (sequential) and the age bands (ordinal) are ramps of one blue, `--hue-ramp`. A lighter or darker blue means more or older, never a name.
- **The categorical set is identity.** Six hues, used only when one chart shows several named series at once and the reader has to tell them apart: a stacked trend by discipline, the nodes and legend of the blocker graph. It never decorates a single series.
- **Status marks are state.** Three colors for marks that mean overdue, stale, or released, always with an icon and a label.

Each set is validated in both themes with the palette validator of the data visualization method (`validate_palette.js`). The commands, the result for every set, and what each result does and does not show are recorded in `tools/design/palette-validation.md`. Every claim this section makes is also enforced by `node tools/design/check-tokens.mjs`, so the claims hold without the validator at hand.

**Neutral: plain data.** A slate, tinted like the other neutrals, in three steps that move away from the surface: lighter in dark, darker in light.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-chart-neutral` | `oklch(0.620 0.016 var(--hue-neutral))` | `oklch(0.570 0.018 var(--hue-neutral))` | The mark of every single-series chart: the bar of a bar row, a single trend line. |
| `--color-chart-neutral-hover` | `oklch(0.700 0.016 var(--hue-neutral))` | `oklch(0.500 0.020 var(--hue-neutral))` | The bar of a bar row while the row is hovered or pressed, and a single mark under the pointer. |
| `--color-chart-neutral-selected` | `oklch(0.780 0.014 var(--hue-neutral))` | `oklch(0.420 0.022 var(--hue-neutral))` | The bar of a bar row whose category is in the active filter. |

Hover and the filter change the bar's step and the row's fill together, so no state rests on one faint difference. All three steps clear 3:1 on every fill a bar row can have.

**Categorical: identity.** Six hues in a fixed order, then Other. Slots are assigned in order and never cycled. A seventh category does not get a seventh color: it folds into Other. The set leaves out every hue that already means something: red (danger), amber and gold (warning), the green of success, teal (the accent), and the excluded range from 270 to 350. Rose and burnt orange are in the set by the owner's decision.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-chart-1` | `oklch(0.660 0.160 262)` | `oklch(0.500 0.140 262)` | Blue. Slot 1. |
| `--color-chart-2` | `oklch(0.605 0.125 165)` | `oklch(0.585 0.115 165)` | Jade, a blue-leaning green. Slot 2. |
| `--color-chart-3` | `oklch(0.625 0.150 50)` | `oklch(0.535 0.130 50)` | Burnt orange. Slot 3. |
| `--color-chart-4` | `oklch(0.605 0.115 230)` | `oklch(0.590 0.115 230)` | Sky, a steel blue. Slot 4. |
| `--color-chart-5` | `oklch(0.620 0.135 5)` | `oklch(0.435 0.125 5)` | Rose. Slot 5. |
| `--color-chart-6` | `oklch(0.665 0.120 110)` | `oklch(0.520 0.110 116)` | Olive. Slot 6. |
| `--color-chart-other` | `var(--color-chart-neutral)` | `var(--color-chart-neutral)` | Other: everything past the sixth category, always last. The neutral of plain data, so it never reads as a seventh identity. |

What the set guarantees, and what it does not:

- **Neighbouring slots are told apart.** Slots k and k+1 are at least 8 apart under simulated protanopia and deuteranopia (closest pair 9.9 in dark, 9.2 in light) and at least 15 apart in normal vision (20.9 in dark, 21.1 in light). Distances are Euclidean in OKLab, times 100.
- **The first three slots are told apart in any arrangement.** With every pair of slots 1 to 3 compared, the closest pair is still 10.3 in dark and 9.2 in light under simulated color blindness, and 22.1 and 21.1 in normal vision.
- **All six are not told apart in any arrangement, and no order of six hues can be.** With every pair compared, the closest pair in normal vision is blue and sky at 10.3 in dark, and jade and olive at 11.4 in light; under simulated color blindness some pairs fall near 2.
- **So the order of the marks is fixed, not left to the data.** Stacked segments, stacked areas, and lines are drawn in slot order, so that only neighbouring slots touch. They are never re-sorted by value. Where sorting by value is wanted, the chart is a bar row group in the neutral color and the labels carry identity. Where any two marks can touch (the blocker graph, a scatter), every mark carries its label, without exception. Color is a second cue there, and the guarantee for the first three slots says how far that cue reaches.
- **A series is kept apart from a state, by a small margin.** Every slot is at least 10 from every status mark in the same theme, in normal vision. 10 is not a comfortable distance. It is what this set achieves with rose and burnt orange in it, which the owner chose to keep knowing the cost: burnt orange lies between danger red and warning amber on the hue circle, and rose lies beside danger. The closest pairs, dark then light: burnt orange and danger, 10.7 and 10.3; rose and danger, 11.4 and 10.4. In the light theme three more pairs sit near the minimum: burnt orange and warning 10.4, olive and warning 10.3, olive and success 10.2. Rose moved closer to danger in this revision (it was 13.8 and 15.5), because every mark now has to clear 3:1 on every fill. In exchange the two near-identical pairs of the first version are gone: its green and gold sat 3.1 and 3.7 from success and warning. Jade and olive now sit on either side of the success green. Under simulated red-green color blindness the distance is not held at all: the closest pair is 1.5 in dark (jade and danger) and 2.0 in light (burnt orange and success). For those readers a status mark is told from a series by its icon and label alone, which is why a status mark never appears without them. The checker enforces the minimum of 10 and reports the color-blind figure on every run without enforcing it, so that a later change is seen. In the dark theme every status mark is also brighter than every series slot.
- **Every slot is a visible mark everywhere.** Each slot clears 3:1 on every fill that carries marks (see "Fills" after this section). In dark that puts all six between lightness 0.605 and 0.665, so no series outweighs another. Every slot also stays inside the lightness band of a series (0.48 to 0.67 in dark, 0.43 to 0.77 in light) and above a chroma of 0.10, below which a hue reads as gray.

**Sequential: magnitude.** One hue, blue, seven steps. Low values recede toward the surface, so the ramp runs dark to light in the dark theme and light to dark in the light theme. Used for the heatmap. Every cell prints its value: the label uses `--color-text-primary` on steps 1 to 4 and `--color-chart-text-inverse` on steps 5 to 7, and both clear 4.5:1 in both themes. A cell with no holds is left unfilled. Because the printed value carries the number and a gap separates the cells, the lowest steps are allowed to sit close to the surface: the sequential steps are cell fills, not marks, and are exempt from the 3:1 rule for marks. The checker instead requires each step to be the background of a text pair.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-chart-seq-1` | `oklch(0.270 0.050 var(--hue-ramp))` | `oklch(0.930 0.030 var(--hue-ramp))` | Lowest value. Recedes toward the surface. |
| `--color-chart-seq-2` | `oklch(0.350 0.068 var(--hue-ramp))` | `oklch(0.830 0.065 var(--hue-ramp))` | Low. |
| `--color-chart-seq-3` | `oklch(0.430 0.086 var(--hue-ramp))` | `oklch(0.730 0.095 var(--hue-ramp))` | Lower middle. |
| `--color-chart-seq-4` | `oklch(0.510 0.100 var(--hue-ramp))` | `oklch(0.635 0.115 var(--hue-ramp))` | Last step that takes primary text. |
| `--color-chart-seq-5` | `oklch(0.590 0.110 var(--hue-ramp))` | `oklch(0.540 0.120 var(--hue-ramp))` | First step that takes inverse text. |
| `--color-chart-seq-6` | `oklch(0.670 0.118 var(--hue-ramp))` | `oklch(0.455 0.115 var(--hue-ramp))` | Upper middle. |
| `--color-chart-seq-7` | `oklch(0.750 0.120 var(--hue-ramp))` | `oklch(0.370 0.098 var(--hue-ramp))` | Highest value. |
| `--color-chart-text-inverse` | `oklch(0.150 0.020 var(--hue-ramp))` | `oklch(0.985 0.005 var(--hue-ramp))` | Cell label on sequential steps 5 to 7. |

**Ordinal: ordered bands.** The same blue in five steps for age bands, where each band is a discrete mark. Neighbouring steps differ by 0.07 in lightness (the minimum is 0.06). The step nearest the surface clears 3:1 on every fill that carries marks, not only the 2:1 the validator asks of an ordinal ramp. A first step under 3:1 could have been kept as a recorded exception with a lower minimum of its own. It was raised instead, because age band bars sit in bar rows that are hovered, pressed, and filtered, and a rule without exceptions cannot be worked around. A workspace with more than five age bands reuses step 5 for the last bands and relies on the labels.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-chart-ord-1` | `oklch(0.610 0.115 var(--hue-ramp))` | `oklch(0.590 0.115 var(--hue-ramp))` | First band (youngest, 0 to 13 days by default). |
| `--color-chart-ord-2` | `oklch(0.680 0.125 var(--hue-ramp))` | `oklch(0.520 0.125 var(--hue-ramp))` | Second band. |
| `--color-chart-ord-3` | `oklch(0.750 0.120 var(--hue-ramp))` | `oklch(0.450 0.120 var(--hue-ramp))` | Third band. |
| `--color-chart-ord-4` | `oklch(0.820 0.085 var(--hue-ramp))` | `oklch(0.380 0.100 var(--hue-ramp))` | Fourth band. |
| `--color-chart-ord-5` | `oklch(0.890 0.050 var(--hue-ramp))` | `oklch(0.310 0.080 var(--hue-ramp))` | Last band (oldest, 90 days and over by default). |

**Status: real states only.** Reserved for marks that mean a state: overdue, stale, released. They are not in the categorical set, never stand for "series 4", and always come with an icon and a label. A chart colors a given set of marks by category or by status, never both. The three are at least 15 apart from each other in normal vision (closest pair 15.9 in dark, 20.5 in light). Under simulated color blindness the closest pair is 6.5 in dark and 6.9 in light: above the floor of 6 that the method allows only with a second cue, and the icon and label are that cue. Red, amber, and green are the hues that the common forms of color blindness confuse. Pushing them further apart would cost their contrast on the fills or their distance from the series slots, which is why a state is never shown by color alone.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-chart-status-danger` | `oklch(0.710 0.170 27)` | `oklch(0.485 0.195 27)` | Mark for a real danger state: an overdue follow-up. |
| `--color-chart-status-warning` | `oklch(0.805 0.150 80)` | `oklch(0.605 0.120 86)` | Mark for a real warning state: a stale hold. |
| `--color-chart-status-success` | `oklch(0.830 0.155 142)` | `oklch(0.435 0.130 142)` | Mark for a real success state: released, target met. |

**Chart chrome.**

| Token | Value | Use |
|---|---|---|
| `--color-chart-grid` | `var(--color-border-subtle)` | Gridlines. |
| `--color-chart-axis` | `var(--color-border-default)` | Baseline and axis line. |
| `--color-chart-band` | `var(--color-surface-pressed)` | The forecast range behind a trend line. A neutral fill, so every mark is already checked against it. |

Axis labels use `--color-text-muted`, value labels `--color-text-secondary`, and titles `--color-text-primary`. Text in a chart never wears a series color.

**Chart rules.**

- Thirteen disciplines exceed the six-color set. Discipline bars use one color, `--color-chart-neutral`. The graph and stacked trends color the six disciplines that hold a slot and fold the rest into `--color-chart-other`. Labels always carry identity.
- Stacked segments, stacked areas, and lines are drawn in slot order, never in value order. A chart that is sorted by value is a bar row group in the neutral color.
- A slot belongs to an entity (for example a discipline), never to a rank. The first time a workspace needs slots, its entities take them in descending order of hold count in the snapshot in view. The assignment is then kept for the workspace, so an entity keeps its color across snapshots, filters, and sessions, and filtering never repaints the survivors. An entity without a slot is drawn as Other. Where the assignment is stored is decided by the plan that first draws a multi-color chart.
- The open-holds trend is a line in `--color-chart-neutral`. Its forecast range is a band in `--color-chart-band` behind the line, and the projected part of the line is dashed.
- No chart has two value axes.
- Every chart has a tooltip, keyboard focus that shows what hover shows, and a table view.
- Neighboring marks are separated by a `--space-0-5` gap that shows the chart surface, never by an outline in a third color.

**To re-validate after any change**, run the checker, then the commands in `tools/design/palette-validation.md`. The first command below prints the hex list the validator takes:

```
node tools/design/check-tokens.mjs --hex dark --color-chart-1 --color-chart-2 --color-chart-3 --color-chart-4 --color-chart-5 --color-chart-6
node <dataviz skill>/scripts/validate_palette.js "<hex list>" --mode dark --surface "<hex of --color-surface-panel>"
node <dataviz skill>/scripts/validate_palette.js "<hex list of --color-chart-ord-1 to 5>" --mode dark --surface "<hex>" --ordinal
```

### Fills

What a fill may carry is written down once, here, and checked.

**Chart marks.** A chart mark is any `--color-chart-` token except the sequential steps, `--color-chart-text-inverse`, and the chart chrome: the three neutral steps, the six slots, Other, the five ordinal steps, and the three status marks. Marks are not listed in the contrast pairs table. The checker runs every mark against every fill below that carries marks, in both themes, with a minimum of 3:1, so no combination of a mark and a fill can go unchecked.

**The primary button.** Its fill is an accent step, and a deep accent only stands out from the two base surfaces. The table says which fills carry a primary button, and on each of them the checker measures the button's fill: at least 3:1 at rest (`--color-accent`) and on hover (`--color-accent-hover`), and at least 2.5:1 while pressed (`--color-accent-active`; the accent section says why the pressed step has a lower minimum). What the checker cannot see is whether a component obeys the table: it reads this file, not interface code. Putting a primary button only on a fill marked "yes" is therefore a rule for whoever builds and reviews a component.

**Every fill is classified.** A fill is any surface token, any subtle tint, the chart band, and any token the contrast pairs table uses as a background. Each must have a row; a new one fails the check until someone decides what it may carry.

| Fill | Carries marks | Carries a primary button | Why |
|---|---|---|---|
| `--color-surface-app` | yes | yes | The content area: charts, bar rows, and the one primary button of a page. |
| `--color-surface-panel` | yes | yes | Top bar, detail panel, filter bar: Import in the top bar; charts in the detail panel; a legend in the filter bar. |
| `--color-surface-raised` | yes | no | A mark in a table header or in the stat tile group. The accent fill is 2.89:1 here in dark. |
| `--color-surface-overlay` | yes | no | Legend swatches in a chart tooltip. A menu or a toast holds quiet buttons only. |
| `--color-surface-hover` | yes | no | A bar row or a table row under the pointer. A hover fill is never put under a primary button. |
| `--color-surface-pressed` | yes | no | The same row while pressed. |
| `--color-surface-overlay-hover` | yes | no | A swatch in a highlighted item of a filter picker. |
| `--color-accent-subtle` | yes | no | A bar row in the active filter; a selected table row; the active drop zone, which hides its button. |
| `--color-accent-subtle-hover` | yes | no | The same row under the pointer. |
| `--color-accent-open` | no | no | The open row of a table among other selected rows. A table row holds text, identifiers, and quiet row actions; no chart mark and no primary button. |
| `--color-accent-open-hover` | no | no | As above, under the pointer. |
| `--color-chart-band` | yes | no | The forecast range behind a trend line. |
| `--color-surface-field` | no | no | The inside of a field holds text and icons only. |
| `--color-surface-disabled` | no | no | A disabled control holds its own label only, and so does a filter chip that is not in this snapshot, which stays operable: its field, value, icon, and X, in `--color-text-primary`. |
| `--color-danger-subtle` | no | no | A notice or a tag holds text, an icon, quiet buttons, and links. |
| `--color-warning-subtle` | no | no | As above. |
| `--color-success-subtle` | no | no | As above. |
| `--color-info-subtle` | no | no | As above. |
| `--color-accent` | no | no | The fill of a control. It holds that control's label or check mark only. |
| `--color-accent-hover` | no | no | As above. |
| `--color-accent-active` | no | no | As above. |
| `--color-border-default` | no | no | The progress track. It holds the progress fill only. |
| `--color-chart-seq-1` | no | no | A heatmap cell. It holds its printed value only. |
| `--color-chart-seq-2` | no | no | As above. |
| `--color-chart-seq-3` | no | no | As above. |
| `--color-chart-seq-4` | no | no | As above. |
| `--color-chart-seq-5` | no | no | As above. |
| `--color-chart-seq-6` | no | no | As above. |
| `--color-chart-seq-7` | no | no | As above. |

### Contrast pairs

Every pair of a text, border, or ring color and a fill that a component uses is listed here and checked in both themes by `node tools/design/check-tokens.mjs`. Kinds and their floors: `text` 4.5, `large-text` 3, `control-border` 3, `focus-ring` 3, and `graphic` 3 for a meaningful graphic that is not a chart mark (the progress fill against its track). No role in this system relies on the large-text allowance: headings and stat values use `--color-text-primary`, which clears 4.5:1 everywhere. A component may only combine a foreground and a background that appear together in this table.

Five things are deliberately not in the table:

- **Chart marks.** They are covered by a wider rule: every mark on every fill that carries marks, as set out under "Fills".
- **The fill of the primary button.** Also covered under "Fills": the three accent steps on every fill that carries a primary button. Its label is in the table.
- **Decorative colors.** `--color-border-subtle`, `--color-border-default`, the hairlines `--color-accent-border`, `--color-danger-border`, `--color-warning-border`, `--color-success-border`, and `--color-info-border`, and `--color-skeleton` separate or stand in for content and carry no information of their own, so they have no minimum.
- **Disabled controls.** `--color-text-disabled` on `--color-surface-disabled` is exempt, as WCAG exempts inactive controls.
- **The progress track against the surface.** The track is `--color-border-default`, a decorative color: about 1.5:1 on the app surface in dark and 1.4:1 in light. It is exempt on purpose. The track only hints at the full length, and nothing depends on seeing it: the label above every progress bar gives the count and the total in words. What must be seen is the fill, and that is checked twice: against the track (the `graphic` row) and against the surface the bar sits on.

| Foreground | Background | Minimum | Kind | Used by |
|---|---|---|---|---|
| `--color-text-primary` | `--color-surface-app` | 4.5 | text | Content area: tables, bar rows, page headers, empty states. |
| `--color-text-primary` | `--color-surface-panel` | 4.5 | text | Top bar, sidebar, detail panel, filter bar. |
| `--color-text-primary` | `--color-surface-raised` | 4.5 | text | Table header, stat tiles. |
| `--color-text-primary` | `--color-surface-overlay` | 4.5 | text | Menus, popovers, option lists, toasts, tooltips, command palette. |
| `--color-text-primary` | `--color-surface-field` | 4.5 | text | Typed text in fields and selects. |
| `--color-text-primary` | `--color-surface-hover` | 4.5 | text | Hovered rows, sidebar items, tiles, buttons. |
| `--color-text-primary` | `--color-surface-pressed` | 4.5 | text | Pressed rows, sidebar items, buttons. |
| `--color-text-primary` | `--color-surface-overlay-hover` | 4.5 | text | Highlighted menu item and option. |
| `--color-text-primary` | `--color-accent-subtle` | 4.5 | text | Selected row, current sidebar item, active filter chip. |
| `--color-text-primary` | `--color-accent-subtle-hover` | 4.5 | text | Hover over a selected element. |
| `--color-text-primary` | `--color-accent-open` | 4.5 | text | The open row among other selected rows. |
| `--color-text-primary` | `--color-accent-open-hover` | 4.5 | text | The open row among other selected rows, under the pointer. |
| `--color-text-primary` | `--color-danger-subtle` | 4.5 | text | Danger notice and tag. |
| `--color-text-primary` | `--color-warning-subtle` | 4.5 | text | Warning notice and tag. |
| `--color-text-primary` | `--color-success-subtle` | 4.5 | text | Success notice and tag. |
| `--color-text-primary` | `--color-info-subtle` | 4.5 | text | Info notice and tag. |
| `--color-text-secondary` | `--color-surface-app` | 4.5 | text | Content area: tables, bar rows, page headers, empty states. Also the border of a hovered drop zone. |
| `--color-text-secondary` | `--color-surface-panel` | 4.5 | text | Top bar, sidebar, detail panel, filter bar. |
| `--color-text-secondary` | `--color-surface-raised` | 4.5 | text | Table header, stat tiles. |
| `--color-text-secondary` | `--color-surface-overlay` | 4.5 | text | Menus, popovers, option lists, toasts, tooltips, command palette. |
| `--color-text-secondary` | `--color-surface-field` | 4.5 | text | Typed text in fields and selects. |
| `--color-text-secondary` | `--color-surface-hover` | 4.5 | text | Hovered rows, sidebar items, tiles, buttons. |
| `--color-text-secondary` | `--color-surface-pressed` | 4.5 | text | Pressed rows, sidebar items, buttons. |
| `--color-text-secondary` | `--color-surface-overlay-hover` | 4.5 | text | Highlighted menu item and option; the count of a highlighted option, and the border of its unticked mark. |
| `--color-text-secondary` | `--color-accent-subtle` | 4.5 | text | Selected row, current sidebar item, active filter chip. |
| `--color-text-secondary` | `--color-accent-subtle-hover` | 4.5 | text | Hover over a selected element. |
| `--color-text-secondary` | `--color-accent-open` | 4.5 | text | The open row among other selected rows. |
| `--color-text-secondary` | `--color-accent-open-hover` | 4.5 | text | The open row among other selected rows, under the pointer. |
| `--color-text-secondary` | `--color-danger-subtle` | 4.5 | text | Danger notice and tag. |
| `--color-text-secondary` | `--color-warning-subtle` | 4.5 | text | Warning notice and tag. |
| `--color-text-secondary` | `--color-success-subtle` | 4.5 | text | Success notice and tag. |
| `--color-text-secondary` | `--color-info-subtle` | 4.5 | text | Info notice and tag. |
| `--color-text-muted` | `--color-surface-app` | 4.5 | text | Captions, units, the Soon tag on content area: tables, bar rows, page headers, empty states. |
| `--color-text-muted` | `--color-surface-panel` | 4.5 | text | Captions, units, the Soon tag on top bar, sidebar, detail panel, filter bar. |
| `--color-text-muted` | `--color-surface-raised` | 4.5 | text | Captions, units, the Soon tag on table header, stat tiles. |
| `--color-text-muted` | `--color-surface-overlay` | 4.5 | text | Captions, units, the Soon tag on menus, toasts, tooltips, command palette. |
| `--color-text-muted` | `--color-surface-field` | 4.5 | text | Placeholder text. |
| `--color-text-muted` | `--color-surface-hover` | 4.5 | text | Captions, units, the Soon tag on hovered rows, sidebar items, tiles, buttons. |
| `--color-text-muted` | `--color-surface-pressed` | 4.5 | text | Captions, units, the Soon tag on pressed rows, sidebar items, buttons. |
| `--color-text-muted` | `--color-surface-overlay-hover` | 4.5 | text | Captions, units, the Soon tag on highlighted menu item. |
| `--color-text-muted` | `--color-accent-subtle` | 4.5 | text | Captions, units, the Soon tag on selected row, current sidebar item, active filter chip. |
| `--color-text-primary` | `--color-surface-disabled` | 4.5 | text | Field, value, icon, and X of a filter chip that is not in this snapshot. |
| `--color-text-muted` | `--color-accent-subtle-hover` | 4.5 | text | Captions, units, the Soon tag on hover over a selected element. |
| `--color-text-muted` | `--color-accent-open` | 4.5 | text | The open row among other selected rows. |
| `--color-text-muted` | `--color-accent-open-hover` | 4.5 | text | The open row among other selected rows, under the pointer. |
| `--color-accent-text` | `--color-surface-app` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-panel` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-raised` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-overlay` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-hover` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-pressed` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-overlay-hover` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-accent-subtle` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-accent-subtle-hover` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-accent-open` | 4.5 | text | The open row among other selected rows. |
| `--color-accent-text` | `--color-accent-open-hover` | 4.5 | text | The open row among other selected rows, under the pointer. |
| `--color-accent-text` | `--color-danger-subtle` | 4.5 | text | A link inside a danger notice. |
| `--color-accent-text` | `--color-warning-subtle` | 4.5 | text | A link inside a warning notice. |
| `--color-accent-text` | `--color-success-subtle` | 4.5 | text | A link inside a success notice. |
| `--color-accent-text` | `--color-info-subtle` | 4.5 | text | A link inside a info notice. |
| `--color-text-on-accent` | `--color-accent` | 4.5 | text | Primary button label, check mark, the dot of a chosen radio. |
| `--color-text-on-accent` | `--color-accent-hover` | 4.5 | text | Primary button label, check mark, and radio dot, hover. |
| `--color-text-on-accent` | `--color-accent-active` | 4.5 | text | Primary button label, check mark, and radio dot, pressed. |
| `--color-danger-text` | `--color-danger-subtle` | 4.5 | text | Danger icon and state tag text on its own tint. |
| `--color-danger-text` | `--color-surface-app` | 4.5 | text | Danger text and icon outside a notice: field error message, danger button label. |
| `--color-danger-text` | `--color-surface-panel` | 4.5 | text | Danger text and icon outside a notice: field error message, danger button label. |
| `--color-danger-text` | `--color-surface-raised` | 4.5 | text | Danger text and icon outside a notice: field error message, danger button label. |
| `--color-danger-text` | `--color-surface-overlay` | 4.5 | text | Danger text and icon outside a notice: field error message, danger button label. |
| `--color-danger-text` | `--color-surface-field` | 4.5 | text | Danger text and icon outside a notice: field error message, danger button label. |
| `--color-danger-text` | `--color-surface-hover` | 4.5 | text | Danger text and icon outside a notice: field error message, danger button label. |
| `--color-danger-text` | `--color-surface-pressed` | 4.5 | text | Danger text and icon outside a notice: field error message, danger button label. |
| `--color-danger-text` | `--color-accent-subtle` | 4.5 | text | Danger text and icon outside a notice: field error message, danger button label. |
| `--color-danger-text` | `--color-accent-subtle-hover` | 4.5 | text | Danger text and icon outside a notice: field error message, danger button label. |
| `--color-danger-text` | `--color-accent-open` | 4.5 | text | The open row among other selected rows. |
| `--color-danger-text` | `--color-accent-open-hover` | 4.5 | text | The open row among other selected rows, under the pointer. |
| `--color-warning-text` | `--color-warning-subtle` | 4.5 | text | Warning icon and state tag text on its own tint. |
| `--color-warning-text` | `--color-surface-app` | 4.5 | text | Warning text and icon outside a notice. |
| `--color-warning-text` | `--color-surface-panel` | 4.5 | text | Warning text and icon outside a notice. |
| `--color-warning-text` | `--color-surface-raised` | 4.5 | text | Warning text and icon outside a notice. |
| `--color-warning-text` | `--color-surface-overlay` | 4.5 | text | Warning text and icon outside a notice. |
| `--color-warning-text` | `--color-surface-field` | 4.5 | text | Warning text and icon outside a notice. |
| `--color-warning-text` | `--color-surface-hover` | 4.5 | text | Warning text and icon outside a notice. |
| `--color-warning-text` | `--color-surface-pressed` | 4.5 | text | Warning text and icon outside a notice. |
| `--color-warning-text` | `--color-accent-subtle` | 4.5 | text | Warning text and icon outside a notice. |
| `--color-warning-text` | `--color-accent-subtle-hover` | 4.5 | text | Warning text and icon outside a notice. |
| `--color-warning-text` | `--color-accent-open` | 4.5 | text | The open row among other selected rows. |
| `--color-warning-text` | `--color-accent-open-hover` | 4.5 | text | The open row among other selected rows, under the pointer. |
| `--color-success-text` | `--color-success-subtle` | 4.5 | text | Success icon and state tag text on its own tint. |
| `--color-success-text` | `--color-surface-app` | 4.5 | text | Success text and icon outside a notice. |
| `--color-success-text` | `--color-surface-panel` | 4.5 | text | Success text and icon outside a notice. |
| `--color-success-text` | `--color-surface-raised` | 4.5 | text | Success text and icon outside a notice. |
| `--color-success-text` | `--color-surface-overlay` | 4.5 | text | Success text and icon outside a notice. |
| `--color-success-text` | `--color-surface-field` | 4.5 | text | Success text and icon outside a notice. |
| `--color-success-text` | `--color-surface-hover` | 4.5 | text | Success text and icon outside a notice. |
| `--color-success-text` | `--color-surface-pressed` | 4.5 | text | Success text and icon outside a notice. |
| `--color-success-text` | `--color-accent-subtle` | 4.5 | text | Success text and icon outside a notice. |
| `--color-success-text` | `--color-accent-subtle-hover` | 4.5 | text | Success text and icon outside a notice. |
| `--color-success-text` | `--color-accent-open` | 4.5 | text | The open row among other selected rows. |
| `--color-success-text` | `--color-accent-open-hover` | 4.5 | text | The open row among other selected rows, under the pointer. |
| `--color-info-text` | `--color-info-subtle` | 4.5 | text | Info icon and state tag text on its own tint. |
| `--color-info-text` | `--color-surface-app` | 4.5 | text | Info text and icon outside a notice. |
| `--color-info-text` | `--color-surface-panel` | 4.5 | text | Info text and icon outside a notice. |
| `--color-info-text` | `--color-surface-raised` | 4.5 | text | Info text and icon outside a notice. |
| `--color-info-text` | `--color-surface-overlay` | 4.5 | text | Info text and icon outside a notice. |
| `--color-info-text` | `--color-surface-field` | 4.5 | text | Info text and icon outside a notice. |
| `--color-info-text` | `--color-surface-hover` | 4.5 | text | Info text and icon outside a notice. |
| `--color-info-text` | `--color-surface-pressed` | 4.5 | text | Info text and icon outside a notice. |
| `--color-info-text` | `--color-accent-subtle` | 4.5 | text | Info text and icon outside a notice. |
| `--color-info-text` | `--color-accent-subtle-hover` | 4.5 | text | Info text and icon outside a notice. |
| `--color-info-text` | `--color-accent-open` | 4.5 | text | The open row among other selected rows. |
| `--color-info-text` | `--color-accent-open-hover` | 4.5 | text | The open row among other selected rows, under the pointer. |
| `--color-text-primary` | `--color-chart-seq-1` | 4.5 | text | Heatmap cell label, steps 1 to 4. |
| `--color-text-primary` | `--color-chart-seq-2` | 4.5 | text | Heatmap cell label, steps 1 to 4. |
| `--color-text-primary` | `--color-chart-seq-3` | 4.5 | text | Heatmap cell label, steps 1 to 4. |
| `--color-text-primary` | `--color-chart-seq-4` | 4.5 | text | Heatmap cell label, steps 1 to 4. |
| `--color-chart-text-inverse` | `--color-chart-seq-5` | 4.5 | text | Heatmap cell label, steps 5 to 7. |
| `--color-chart-text-inverse` | `--color-chart-seq-6` | 4.5 | text | Heatmap cell label, steps 5 to 7. |
| `--color-chart-text-inverse` | `--color-chart-seq-7` | 4.5 | text | Heatmap cell label, steps 5 to 7. |
| `--color-border-strong` | `--color-surface-app` | 3 | control-border | Border of a field, select, unchecked checkbox, unchosen radio, secondary button, add-filter chip, drop zone. |
| `--color-border-strong` | `--color-surface-panel` | 3 | control-border | Border of a field, select, unchecked checkbox, unchosen radio, secondary button, add-filter chip, drop zone. |
| `--color-border-strong` | `--color-surface-raised` | 3 | control-border | Border of a field, select, unchecked checkbox, unchosen radio, secondary button, add-filter chip, drop zone. |
| `--color-border-strong` | `--color-surface-overlay` | 3 | control-border | Border of a field, select, unchecked checkbox, unchosen radio, secondary button, add-filter chip, drop zone. |
| `--color-border-strong` | `--color-surface-field` | 3 | control-border | Border of a field, select, unchecked checkbox, unchosen radio, secondary button, add-filter chip, drop zone. |
| `--color-border-strong` | `--color-surface-hover` | 3 | control-border | Border of a field, select, unchecked checkbox, unchosen radio, secondary button, add-filter chip, drop zone. |
| `--color-border-strong` | `--color-surface-pressed` | 3 | control-border | Border of a field, select, unchecked checkbox, unchosen radio, secondary button, add-filter chip, drop zone. |
| `--color-border-strong` | `--color-surface-disabled` | 3 | control-border | The dashed outline of a filter chip that is not in this snapshot, against its own fill. |
| `--color-accent-text` | `--color-surface-app` | 3 | control-border | Border of a checked checkbox, a chosen radio, and a focused field, the selected tab indicator, the active drop zone, the progress fill. |
| `--color-accent-text` | `--color-surface-panel` | 3 | control-border | Border of a checked checkbox, a chosen radio, and a focused field, the selected tab indicator, the active drop zone, the progress fill. |
| `--color-accent-text` | `--color-surface-raised` | 3 | control-border | Border of a checked checkbox, a chosen radio, and a focused field, the selected tab indicator, the active drop zone, the progress fill. |
| `--color-accent-text` | `--color-surface-overlay` | 3 | control-border | Border of a checked checkbox, a chosen radio, and a focused field, the selected tab indicator, the active drop zone, the progress fill. |
| `--color-accent-text` | `--color-surface-field` | 3 | control-border | Border of a checked checkbox, a chosen radio, and a focused field, the selected tab indicator, the active drop zone, the progress fill. |
| `--color-accent-text` | `--color-surface-hover` | 3 | control-border | Border of a checked checkbox, a chosen radio, and a focused field, the selected tab indicator, the active drop zone, the progress fill. |
| `--color-accent-text` | `--color-surface-pressed` | 3 | control-border | Border of a checked checkbox, a chosen radio, and a focused field, the selected tab indicator, the active drop zone, the progress fill. |
| `--color-danger-text` | `--color-surface-app` | 3 | control-border | Border of a field in error and of a danger button. |
| `--color-danger-text` | `--color-surface-panel` | 3 | control-border | Border of a field in error and of a danger button. |
| `--color-danger-text` | `--color-surface-field` | 3 | control-border | Border of a field in error and of a danger button. |
| `--color-accent-text` | `--color-border-default` | 3 | graphic | The progress fill against its track. |
| `--color-accent-text` | `--color-accent-open` | 3 | graphic | The dot that marks the open row among two or more selected rows. |
| `--color-accent-text` | `--color-accent-open-hover` | 3 | graphic | The same dot under the pointer. |
| `--color-focus-ring` | `--color-surface-app` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-surface-panel` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-surface-raised` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-surface-overlay` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-surface-field` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-surface-hover` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-surface-pressed` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-surface-overlay-hover` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-accent-subtle` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-accent-subtle-hover` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-accent-open` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-accent-open-hover` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-danger-subtle` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-warning-subtle` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-success-subtle` | 3 | focus-ring | Focus ring. |
| `--color-focus-ring` | `--color-info-subtle` | 3 | focus-ring | Focus ring. |

### Named Rules

**The One Ink Rule.** Teal is used for the primary action, the current selection, focus, links, and progress, on at most a tenth of a screen. Anything teal can be acted on, is selected, or is the progress of an action the user started: the fill of a progress bar is the answer of the interface to a press, so it wears the ink of the press. It is never used for decoration, for headings, for icons that are not interactive, or for data: plain data is neutral gray (`--color-chart-neutral`), ramps are blue, and no chart color lies within 25 degrees of the accent hue.

**The Every Mark Rule.** A chart mark clears 3:1 on every fill that carries marks, in both themes. There is no list of approved combinations to keep up to date and no exception to remember: the checker runs all of them.

**The Two Surfaces Rule.** A primary button sits on `--color-surface-app` or `--color-surface-panel` and nowhere else. Nothing that fills on hover, press, or selection holds one.

**The Icon and Label Rule.** A state color never appears alone. Danger, warning, success, and info always come with an icon and a text label, so the teal accent, the green of success, and the blue of info can never be confused, including by a reader who cannot tell the hues apart.

**The Tinted Neutral Rule.** No value is pure black, pure white, or an untinted gray. The checker fails any token that paints as `#000000` or `#ffffff`.

**The No Purple Rule.** No hue from 270 to 350 degrees appears anywhere: not in the accent, not in the neutral tint, not in a chart. The checker fails any hue anchor or color in that range.

**The One Translucent Rule.** `--color-scrim` and the shadow colors are the only translucent values. Hover, selection, and disabled states are opaque tokens, so their contrast can be checked.

## 3. Typography

**Sans Font:** Public Sans, variable weight (npm `@fontsource-variable/public-sans`, family name `Public Sans Variable`, SIL Open Font License 1.1)
**Mono Font:** Reddit Mono, variable weight (npm `@fontsource-variable/reddit-mono`, family name `Reddit Mono Variable`, SIL Open Font License 1.1)

Both are bundled with the app. Nothing is loaded from the network, and no system font is relied on for layout.

**Character:** A sturdy, neutral grotesque for everything, and a narrow, plain monospace for identifiers. Neither has a personality the user would notice, which is the point.

**Why these two.**

- *Public Sans* was drawn for government forms and tables: text that has to be believed, not admired. It has a tall x-height (0.52 em) and open counters that hold up at 13 px, proportional figures by default (for stat tiles) and tabular figures through the `tnum` feature (for tables), and weights from 100 to 900 in one file of about 27 KB for the Latin subset. It is not one of the faces every dashboard reaches for.
- *Reddit Mono* matches Public Sans almost exactly in x-height (0.518 against 0.517 em) and cap height (0.720 against 0.723 em), so a line ID in a table row sits on the same optical line as the text beside it without a size correction. Its zero is slashed, and `1`, `l`, and `I` are three different shapes, so `78B01-573-OO-0100` cannot be misread. At 0.5625 em per character it is narrower than most monospace faces (0.60 em), which saves about 10 px on every 21-character line ID. It has no ligatures, so an ID is never redrawn.

These properties were checked in the font files themselves, not taken from descriptions.

### Type tokens

| Token | Value | Use |
|---|---|---|
| `--font-family-sans` | `"Public Sans Variable", "Segoe UI", system-ui, sans-serif` | All interface text. The fallbacks only cover a failed font load. |
| `--font-family-mono` | `"Reddit Mono Variable", "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace` | Line IDs, tags, source IDs, keyboard keys, file names. Not blocker items: see the Identifier Rule. |
| `--font-size-sm` | `0.8125rem` | 13 px. Body, tables, labels, captions. |
| `--font-size-md` | `1.0625rem` | 17 px. Section titles. |
| `--font-size-lg` | `1.375rem` | 22 px. Page titles. |
| `--font-size-xl` | `1.75rem` | 28 px. Stat values. |
| `--line-height-tight` | `1rem` | 16 px. Single-line interface text. |
| `--line-height-body` | `1.25rem` | 20 px. Running text. |
| `--line-height-md` | `1.5rem` | 24 px. Section titles. |
| `--line-height-lg` | `1.75rem` | 28 px. Page titles. |
| `--line-height-xl` | `2rem` | 32 px. Stat values. |
| `--font-weight-regular` | `400` | Body, table cells, captions. |
| `--font-weight-medium` | `500` | Labels and controls. |
| `--font-weight-semibold` | `600` | Titles, stat values, emphasis inside body text, the label of the sorted table header. |
| `--letter-spacing-normal` | `0` | Everything at 13 and 17 px. |
| `--letter-spacing-tight` | `-0.01em` | Page titles and stat values. |
| `--font-numeric-tabular` | `tabular-nums` | Value of `font-variant-numeric` for numbers that sit in a column. |
| `--font-numeric-proportional` | `proportional-nums` | Value of `font-variant-numeric` for numbers that stand alone. |

The root font size is 16 px. The ratios between sizes are 1.31, 1.29, and 1.27.

### Hierarchy

Each role is one token, written as a CSS `font` shorthand: `font: var(--text-body)`. The shorthand cannot carry letter spacing or figure style, so the roles table after this one gives each role its `letter-spacing` and its `font-variant-numeric` as tokens. A stylesheet sets all three properties for a role and never writes either value as a literal.

| Token | Value | Use |
|---|---|---|
| `--text-page-title` | `var(--font-weight-semibold) var(--font-size-lg)/var(--line-height-lg) var(--font-family-sans)` | Page title, 22/28, semibold. One per page, in the page header. |
| `--text-section-title` | `var(--font-weight-semibold) var(--font-size-md)/var(--line-height-md) var(--font-family-sans)` | Section title, 17/24, semibold. Sections of Overview, panel titles, the title of an empty state. |
| `--text-body` | `var(--font-weight-regular) var(--font-size-sm)/var(--line-height-body) var(--font-family-sans)` | Body, 13/20, regular. Running text, notices, descriptions. Pages of text are at most `--layout-prose-max-width` wide. |
| `--text-body-strong` | `var(--font-weight-semibold) var(--font-size-sm)/var(--line-height-body) var(--font-family-sans)` | Body, 13/20, semibold. The title of a notice, the app name, emphasis in running text. |
| `--text-table` | `var(--font-weight-regular) var(--font-size-sm)/var(--line-height-tight) var(--font-family-sans)` | Table cell, 13/16, regular. Numbers in columns. |
| `--text-label` | `var(--font-weight-medium) var(--font-size-sm)/var(--line-height-tight) var(--font-family-sans)` | Label, 13/16, medium. Buttons, field labels, column headers, sidebar items, tabs, chips, stat tile labels. |
| `--text-caption` | `var(--font-weight-regular) var(--font-size-sm)/var(--line-height-tight) var(--font-family-sans)` | Caption, 13/16, regular, in `--color-text-muted` or `--color-text-secondary`. Helper text, units, timestamps, axis labels, tags. |
| `--text-stat` | `var(--font-weight-semibold) var(--font-size-xl)/var(--line-height-xl) var(--font-family-sans)` | Stat value, 28/32, semibold. A number that stands alone. |
| `--text-mono` | `var(--font-weight-regular) var(--font-size-sm)/var(--line-height-tight) var(--font-family-mono)` | Identifier, 13/16, regular, monospace. Line IDs, tags such as `577-PR-400`, keyboard keys. |

Letter spacing and figure style per role. Every `font` token above has exactly one row, and the checker fails a role without one.

| Role | Letter spacing | Figures |
|---|---|---|
| `--text-page-title` | `--letter-spacing-tight` | `--font-numeric-proportional` |
| `--text-section-title` | `--letter-spacing-normal` | `--font-numeric-proportional` |
| `--text-body` | `--letter-spacing-normal` | `--font-numeric-proportional` |
| `--text-body-strong` | `--letter-spacing-normal` | `--font-numeric-proportional` |
| `--text-table` | `--letter-spacing-normal` | `--font-numeric-tabular` |
| `--text-label` | `--letter-spacing-normal` | `--font-numeric-proportional` |
| `--text-caption` | `--letter-spacing-normal` | `--font-numeric-tabular` |
| `--text-stat` | `--letter-spacing-tight` | `--font-numeric-proportional` |
| `--text-mono` | `--letter-spacing-normal` | `--font-numeric-tabular` |

The table gives the default of each role. The Figures Rule below overrides it in one direction only: a number in any role that sits in a column takes `--font-numeric-tabular`.

### Named Rules

**The Four Sizes Rule.** There are four sizes: 13, 17, 22, and 28 px, each at least 1.25 times the one below. A size between two steps is forbidden. Body, table, label, and caption share 13 px and are told apart by weight (regular, medium, or semibold), ink (primary, secondary, or muted), and figure style. Nothing is smaller than 13 px, because the same screen is read at a desk and from across a meeting room.

**The Figures Rule.** Any number that sits in a column (table cells, bar row values, axis ticks, counts in a filter picker) uses tabular figures, `--font-numeric-tabular`, and is right-aligned. A number that stands alone (a stat value, a count in a sentence) uses proportional figures, `--font-numeric-proportional`.

**The Identifier Rule.** A line ID, a tag (`577-PR-400`) where it stands as a value of its own, a source ID, or a file name is always in `--text-mono`, is never truncated in the middle, never wrapped, and never translated. Text copied from it is the exact source text. These are codes: a reader compares them character by character, so every character has the same width, a zero is slashed, and `1`, `l`, and `I` differ.

A blocker item is not a code of its own and takes the body face (`--text-table` in a table, `--text-body` elsewhere), in the table, in the detail panel, and in the filter picker (decision of the owner, 2026-10-17). It is as often a word ("Stress", "Client", "Vendor data") as a tag, and a word set in a monospace reads as a code it is not; a tag written as a blocker item follows the blocker and takes the body face, and is still the exact text of the remark. A line ID it sits beside keeps the monospace, so the two are told apart at a glance. Like every value, a blocker item is never translated and is copied as the source text. In a table it is cut at the end where its column is too narrow, and read in full in the detail panel.

**The Sentence Case Rule.** No all-caps labels and no letter-spaced small caps. Column headers, tabs, and buttons are sentence case in `--text-label`.

**The Density Rule.** Density changes heights and paddings. It never changes a type size.

## 4. Elevation

Flat by default. Depth is shown first by surface steps and hairlines, and by shadow only for what floats above the page. The two themes do this differently, on purpose:

- **Dark:** a higher layer is a lighter surface (`--color-surface-app`, then `--color-surface-panel`, `--color-surface-raised`, `--color-surface-overlay`). Shadows are nearly invisible on dark surfaces, so an overlay is also outlined with `--color-border-default`.
- **Light:** raised and overlay surfaces are the same bright paper; a shadow and a hairline separate them from the page.

### Shadow Vocabulary

| Token | Dark | Light | Use |
|---|---|---|---|
| `--shadow-raised` | `0 1px 2px oklch(0.08 0.01 var(--hue-neutral) / 0.4)` | `0 1px 2px oklch(0.25 0.02 var(--hue-neutral) / 0.08)` | Under a sticky table header or page toolbar once content has scrolled beneath it. Absent at rest. |
| `--shadow-overlay` | `0 8px 24px oklch(0.08 0.01 var(--hue-neutral) / 0.55), 0 2px 6px oklch(0.08 0.01 var(--hue-neutral) / 0.4)` | `0 8px 24px oklch(0.25 0.02 var(--hue-neutral) / 0.12), 0 2px 6px oklch(0.25 0.02 var(--hue-neutral) / 0.08)` | Menus, popovers, toasts, and the detail panel when it overlays the content. |
| `--shadow-modal` | `0 24px 64px oklch(0.08 0.01 var(--hue-neutral) / 0.65), 0 4px 12px oklch(0.08 0.01 var(--hue-neutral) / 0.45)` | `0 24px 64px oklch(0.25 0.02 var(--hue-neutral) / 0.18), 0 4px 12px oklch(0.25 0.02 var(--hue-neutral) / 0.1)` | The command palette and the shortcut sheet, above `--color-scrim`. |

### Layers

| Token | Value | Use |
|---|---|---|
| `--z-base` | `0` | Page content. |
| `--z-sticky` | `10` | Sticky table header, filter bar. |
| `--z-panel` | `20` | Detail panel when it overlays the content. |
| `--z-dropdown` | `30` | Menus, select lists, popovers. |
| `--z-scrim` | `40` | The scrim. |
| `--z-modal` | `50` | Command palette, shortcut sheet. |
| `--z-toast` | `60` | Toasts. |
| `--z-drop-target` | `70` | The window-wide file drop frame. |
| `--z-tooltip` | `80` | Tooltips. |

### Named Rules

**The Flat at Rest Rule.** Nothing on the page has a shadow at rest. Tiles, tables, notices, and panels are separated by hairlines and surface steps. If a screenshot of a page at rest shows a shadow, something is wrong.

**The No Nesting Rule.** A bordered container never sits inside another bordered container. A group inside a container is separated by a `--color-border-subtle` hairline or by space.

## 5. Components

Every component a screen of the first desktop version needs is specified here with all its states. The charts are specified after the bar row: what every chart shares ("Chart foundations"), the heatmap and its legend, the line chart, their focus and tooltip, and their table view. The legend of several named series is not specified yet, on purpose: it is written by the plan that builds the stacked trends, which will know what it needs. Its colors and rules are fixed in the chart palette above.

### Foundations

**Theme and density selection.** Both are attributes on the root element, and a stylesheet reads nothing else.

- **Theme** is a stored setting with three values: Dark (the default), Light, and System. System follows the operating system and its changes while the app runs. The theme is applied as `data-theme="dark"` or `data-theme="light"` on the root element. System is resolved to one of the two before it is applied, so a stylesheet never sees a third value and needs no media query of its own. The `Dark` column of a token table applies under `data-theme="dark"` and when the attribute is absent; the `Light` column applies under `data-theme="light"`.
- **Density** is `data-density="comfortable"` (the default) or `data-density="compact"` on the root element. A table may override it locally by carrying the attribute itself; the density tokens then take that value for the table and everything inside it.
- **Where they are chosen.** Settings has a form row for each: Theme and Density are selects whose box is no wider than their options, each with a helper line, applied at once as the choice is made and put back, with the reason in a notice under the row, when the choice cannot be saved. Both are kept for the next start and applied before the first render, so the first frame is already in the chosen theme and density. Author name is a text field under them, a line of prose wide: it is saved when the field is left and when Enter is pressed, never while typing, so pressing a sidebar item to leave never loses what was typed. While the save is on its way the field shows the spinner and stays editable; when the save is refused the field keeps the text and shows the reason in its error line.
- **The workspaces folder.** The Settings row in About, under the version, shows the folder in use as a value (label, the path in `--text-mono`, a helper line), then its buttons side by side, wrapping on a narrow window: "Change folder" (with the folder icon), "Use the default folder" (only while another folder is in use), and "Show in folder". "Change folder" opens the system's folder dialog; the folder chosen is checked first (the button shows the spinner meanwhile), and a refusal is a danger notice in the row that says what to do. A folder that passed is offered in an info notice in the row: "Move N workspaces to the new folder?", the folders it moves between, and three quiet buttons under the text, "Move them", "Leave them where they are", and "Cancel"; focus moves to the first of them, and "Cancel" takes it back to "Change folder". The button that started a check shows the spinner while it runs. "Use the default folder" is checked and offered the same way, as "Move N workspaces to the default folder?". A folder in use without workspace files offers "Use this folder" and "Cancel" instead. A check creates nothing: a missing folder passes when the nearest folder above it is writable, and it is made only when the change is sent. While the change runs, the row shows an indeterminate progress bar labelled with what is happening and a helper line that says the other settings wait; the other rows of the page are inert, the folder buttons are busy, and the focus moves to the label of the progress, which takes the global focus ring. The result is a notice in the row, success when every file moved and warning when one was left: the focus moves to its title, which takes the global focus ring (the progress and the result are groups named by that label and title; no rule takes their ring away); its title says how many files moved and where ("No workspace file was moved" when none did), then the moved files are listed by name in `--text-mono`, and each file left is listed by name with the reason under it. When the open workspace's file stayed in the old folder, a last line says that it stays open from there and is not in the list until its file is moved. The result is put away when the next action on the workspace starts. It stays until it is dismissed, also when the page is left and opened again while the files move; dismissing it takes the focus back to "Change folder".
- **About.** Under Author name, a group titled "About" (a section title, `h2`, that names the group) holds three rows: the version, the workspaces folder row above, and the settings file, its path in `--text-mono` with a helper line and "Show in folder", whose accessible name says it is the settings file's. A file that cannot be shown (it is written at the first save) says why in a danger notice under the row.

`node tools/design/check-tokens.mjs --css` prints the tokens under exactly these selectors.

**Spacing.** A 4 px base. Gaps inside a control use `--space-1` to `--space-3`; gaps between controls `--space-2` to `--space-4`; gaps between sections `--space-6` to `--space-12`. Vary the gaps: related things sit close, sections sit apart.

| Token | Value | Use |
|---|---|---|
| `--space-0-5` | `2px` | Hairline gaps: between a mark and its neighbor in a chart. |
| `--space-1` | `4px` | Label to field, icon to tight label, padding inside a menu. |
| `--space-1-5` | `6px` | Icon to label in a button; horizontal padding of a tag. |
| `--space-2` | `8px` | Horizontal padding of a field, a chip, a sidebar item; gap between buttons. |
| `--space-3` | `12px` | Horizontal padding of a button; padding of a notice and a toast. |
| `--space-4` | `16px` | Padding of a stat tile and a panel; gap between a page header and its content. |
| `--space-5` | `20px` | Gap between form rows. |
| `--space-6` | `24px` | Gap between sections on a dense page. |
| `--space-8` | `32px` | Gap between sections on Overview. |
| `--space-10` | `40px` | Padding of a drop zone. |
| `--space-12` | `48px` | Top padding of an empty state on an otherwise empty page. |
| `--space-16` | `64px` | Largest gap; the top of the welcome screen. |

**Radii.**

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | `2px` | Bar fills, heatmap cells, the checkbox, skeleton lines. |
| `--radius-sm` | `4px` | Controls: buttons, fields, selects, tags, sidebar items, menu items. |
| `--radius-md` | `6px` | Containers: stat tile group, notice, menu, drop zone. |
| `--radius-lg` | `8px` | Floating surfaces: toast, command palette. |
| `--radius-full` | `999px` | Filter chips and the remove circle inside one, the progress track, the circle of a radio and of a single-choice mark, and the spinner. |

**Borders and focus.**

| Token | Value | Use |
|---|---|---|
| `--border-width-thin` | `1px` | Every hairline and control border. |
| `--border-width-thick` | `2px` | The selected tab indicator, the active drop zone, the check mark stroke. |
| `--focus-ring-width` | `2px` | Width of the focus ring. |
| `--focus-ring-offset` | `2px` | Gap between an element and its focus ring. |

The focus ring is `outline: var(--focus-ring-width) solid var(--color-focus-ring)` with `outline-offset: var(--focus-ring-offset)`, shown on `:focus-visible` only. Inside a table, a menu, a tab list, or the sidebar, where an outer ring would be clipped, the ring is inset: the offset is the negative of `--focus-ring-width`. The ring is never removed and never replaced by a color change alone.

**Sizes.**

| Token | Value | Use |
|---|---|---|
| `--size-icon` | `16px` | Every icon, and the spinner. |
| `--size-icon-stroke` | `1.5px` | Stroke width of every icon. |
| `--size-checkbox` | `16px` | The checkbox box and the circle of a radio. |
| `--size-radio-dot` | `6px` | The dot inside a chosen radio. |
| `--size-open-mark` | `6px` | The dot at the start of the first cell of the open row among two or more selected rows. It stands in the cell padding (8px at least), so it never moves the text. |
| `--size-tag-height` | `20px` | Height of a tag. |
| `--size-chip-height` | `24px` | Height of a filter chip. |
| `--size-chip-max-width` | `320px` | Widest filter chip. A longer value is cut at the end with an ellipsis. |
| `--size-filterbar-end-width` | `112px` | Width of the trailing part of the filter bar: the total, and in its place the sentence that says why the filters wait, on two lines at most. |
| `--size-bar-height` | `8px` | Thickness of the bar in a bar row. |
| `--size-progress-height` | `4px` | Thickness of the progress track. |
| `--size-progress-segment` | `33.333%` | Width of the travelling segment of an indeterminate progress bar, as a share of the track. |
| `--size-bar-label-width` | `180px` | Width of the label column of a bar row group and of a fact list; the least width of the label column of a group whose labels take the room the bars leave. |
| `--size-bar-min-width` | `96px` | Least width of the bars' column in a group whose labels take the room the bars leave. |
| `--size-menu-min-width` | `180px` | Narrowest menu, when its button is narrower still. |
| `--size-menu-max-width` | `480px` | Widest menu; a longer item is cut at the end with an ellipsis. |
| `--size-stat-tile-min-width` | `160px` | Narrowest stat tile before the row wraps. |
| `--size-dropzone-min-height` | `200px` | Least height of a drop zone. |
| `--size-toast-min-width` | `280px` | Narrowest toast. |
| `--size-toast-max-width` | `480px` | Widest toast. |
| `--size-tooltip-max-width` | `280px` | Widest tooltip; longer text wraps. |
| `--size-popover-width` | `320px` | Width of a popover. It does not change with what the popover holds. |
| `--size-option-list-rows` | `8` | How many rows of an option list show before the list scrolls. |
| `--size-palette-width` | `560px` | Width of the command palette. It does not change with what it lists. |
| `--size-palette-max-height` | `440px` | Tallest command palette; a longer list scrolls inside it. |
| `--size-palette-offset` | `80px` | Distance from the top of the window to the command palette. |
| `--size-pixel` | `1px` | The step a table's width is rounded down to, so the scroller is a whole number of pixels wide and lays out no fraction of a pixel past its edge. |
| `--opacity-stale` | `0.6` | Opacity of the previous render while a refetch is in flight. |

Icons come from one outline set, Lucide (npm `lucide-react`, ISC license), drawn at `--size-icon` with a stroke of `--size-icon-stroke` in `currentColor`. An icon never appears without a text label or an accessible name. The one exception is the separator of a breadcrumb, which stands between two labels and is decoration.

**Motion.** Motion marks a state change and nothing else. There are no entrance sequences and nothing animates on page load.

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | `150ms` | Color and background changes: hover, press, focus, selection. Fades out. |
| `--duration-base` | `200ms` | Things that move a short way: the tab indicator, a toast entering, a menu opening. |
| `--duration-slow` | `250ms` | The largest moves: the detail panel sliding in, the command palette opening. |
| `--ease-out` | `cubic-bezier(0.25, 1, 0.5, 1)` | The one curve for a state change. Everything decelerates into place; nothing bounces or overshoots. |
| `--ease-linear` | `linear` | Timing of the one loop, and of nothing else. |
| `--motion-loop-period` | `1200ms` | The one loop: the spinner and the indeterminate progress bar, with `--ease-linear`. |
| `--timeout-toast` | `8000ms` | How long a toast stays. The timer pauses while the toast is hovered or focused. |
| `--delay-tooltip` | `500ms` | How long the pointer rests on a control before its tooltip shows. Keyboard focus shows it at once. |

Only `opacity`, `transform`, `color`, `background-color`, `border-color`, and `outline-color` are animated. Layout properties (width, height, padding, margin, position offsets) are never animated. Something that appears to grow or travel does so by `transform`: the progress fill and the tab indicator are moved and scaled, not resized. Content that expands in place, such as a group of rows, appears at once and may fade in over `--duration-fast`.

**Reduced motion.** Under `prefers-reduced-motion: reduce`: every transform transition is removed, so panels, toasts, and menus appear in place; color and opacity changes keep `--duration-fast`; the spinner and the indeterminate progress bar stop moving and show a static state beside a text label that says what is happening. No information is carried by motion alone, so nothing is lost.

**Density.** One setting, two values. Comfortable is the default. Density changes row heights and paddings, never type size, and never Overview's section spacing.

| Token | Comfortable | Compact | Use |
|---|---|---|---|
| `--density-row-height` | `36px` | `28px` | Height of a table row and a menu item. |
| `--density-header-height` | `36px` | `28px` | Height of a table header row. |
| `--density-cell-padding-x` | `12px` | `8px` | Horizontal padding of a table cell. |
| `--density-control-height` | `32px` | `28px` | Height of a button, a field, a select, a tab. |
| `--density-nav-item-height` | `32px` | `28px` | Height of a sidebar item. |
| `--density-bar-row-height` | `32px` | `24px` | Height of a bar row. |
| `--density-stack-gap` | `12px` | `8px` | Vertical gap between stacked controls or rows of a form. |

**Shell layout.** The approved layout: a top bar across the window, a labeled sidebar on the left, the content area in the middle with filter chips under the page header, and a detail panel on the right that leaves the list visible.

| Token | Value | Use |
|---|---|---|
| `--layout-topbar-height` | `48px` | Top bar: app name, workspace switcher, global search, snapshot selector, Export, Import. |
| `--layout-sidebar-width` | `208px` | Sidebar with labeled destinations. |
| `--layout-rail-width` | `48px` | The sidebar collapsed to a rail: the icons of the destinations, their names kept for assistive technology and shown in a tooltip on focus and on hover. |
| `--layout-detail-width` | `400px` | Detail panel for the selected line, hold, or blocker. |
| `--layout-filterbar-height` | `44px` | Filter chip bar under the page header on data screens. |
| `--layout-page-padding-x` | `24px` | Left and right padding of the content area, in a large window. In a small or a medium window it takes the value of `--layout-page-padding-x-tight` (see "Adapting to the window"). |
| `--layout-page-padding-x-tight` | `16px` | Left and right padding of the content area below `--layout-breakpoint-roomy`. |
| `--layout-page-padding-y` | `20px` | Top and bottom padding of the content area. |
| `--layout-content-max-width` | `1280px` | Widest Overview and History content. Tables are not capped; they fill the content area. |
| `--layout-form-max-width` | `720px` | Widest form page: Settings, the import review, the mapping step. |
| `--layout-prose-max-width` | `34rem` | Widest running text: about 75 characters at 13 px. |
| `--layout-search-max-width` | `30rem` | Widest global search field. |
| `--layout-search-min-width` | `16rem` | Narrowest global search field: below it the workspace name gives way, not the field. |
| `--layout-breakpoint-wide` | `1280px` | From this window width the detail panel sits beside the content. Below it, the panel overlays the right edge of the content with `--shadow-overlay`. The lower edge of a medium window. |
| `--layout-breakpoint-roomy` | `1440px` | From this window width the content area has its full padding. The lower edge of a large window. |
| `--layout-window-min-width` | `1024px` | Smallest window width. |
| `--layout-window-min-height` | `640px` | Smallest window height. |

**Adapting to the window.** The window is from `--layout-window-min-width` (1024 px) to any width; the owner works on laptops at 1280 px and on large monitors. The layout adapts at two breakpoints and nowhere else, so every screen changes at the same widths and for the same reasons.

- **Three window sizes.** Small, from the least width up to `--layout-breakpoint-wide`; medium, from there up to `--layout-breakpoint-roomy`; large, from there up. The shell reads the two breakpoints from their tokens and marks the root element with `data-window="small"`, `"medium"`, or `"large"`, as it marks the theme and the density. A stylesheet that adapts reads that attribute and writes no media query of its own, so a breakpoint is changed in this file and nowhere else.
- **What adapts, and how.**
  - *Page padding:* `--layout-page-padding-x` in a large window, `--layout-page-padding-x-tight` in a small or a medium one. Everything that is lined up with the page (the shell notices, the filter bar and what it holds, the toasts without a sidebar) follows, because it reads the one token.
  - *Detail panel:* beside the content in a medium and a large window, over its right edge in a small one (see "Detail panel").
  - *Sidebar:* full or a rail, by the user's choice at every width (see "Sidebar item"). It is never collapsed or expanded by the window: a layout that changes by itself while the user resizes would move what they were about to press.
  - *Tables:* each column may have a priority, and the columns of lowest priority leave a table that is too narrow for all of them (see "Table", "Column priority"). This follows the width the table has, not the window, so it answers the panel and the sidebar as well.
- **What does not adapt.** Type sizes, row heights, control heights, and the density: a window is narrower, the text on it is not smaller. Page widths (form, content, full) keep their maximums. The top bar keeps every control; a long workspace name gives way first, as it does today. The filter bar keeps its total on every data screen (owner's answer of 2026-10-17); its chips wrap.
- **Targets.** At 1280 by 800, in both themes and both densities: Lines in a row per line has no sideways scroll; Lines in a row per hold keeps Age (or Duration, or Days) in view; Overview's tiles and bars fit without clipping. At 1024 by 640 nothing the user needs is cut: what leaves a table is in the panel, and a table whose remaining columns still do not fit scrolls sideways with its first column pinned.

Regions and their surfaces: top bar, sidebar, filter bar, and detail panel are `--color-surface-panel`; the content area is `--color-surface-app`. Regions are separated by a `--border-width-thin` hairline in `--color-border-default`, never by a shadow. The sidebar and the detail panel scroll on their own; the top bar never scrolls. Content is left-aligned; Overview does not center itself in a wide window.

**Page widths.** A page has one of three widths, and what the page is for decides which. A page never picks a width of its own.

- **Form width**, at most `--layout-form-max-width`: a page that is filled in or read from top to bottom. Settings, the welcome page, the import page, the sheet step, the import review, a coming soon screen, and the page for an address that does not exist. Running text inside it is still at most `--layout-prose-max-width` wide.
- **Content width**, at most `--layout-content-max-width`: a page of figures and charts that is read across. Overview and History. Wider than this, bars and tiles stretch until a value sits too far from its label.
- **Full width**, the whole content area: a page whose table is the page. Lines, Breakdown, and Blockers, and any later page that is a table first. A table is never capped: more width shows more columns. Such a page is also exactly as tall as the content area: it does not scroll, and its table takes the height under the header, the bar, and whatever stands above the table, and scrolls inside it.
- **A form above a table** is a full-width page whose form part keeps the form width, so the fields stay readable and the table after them takes the content area. The mapping step is the one such page: its fields, then the preview of the file.

**Where an error goes.** An error is shown where the user will look for what went wrong, and in one place only. Whatever the place, the text says what happened, why, and how to fix it.

- **The field**, for what the user typed or chose. A date that cannot be read, a name that is taken, a column that is missing: the message replaces the helper line of that field, and the field is marked as in error. Nothing else on the page repeats it.
- **An inline notice beside what failed**, for an action or a reading that belongs to a place on the page. A button whose action failed has a danger notice directly under or beside it; a table, a bar group, or a panel that could not be read has the notice above it or in its place, with "Try again". The notice stays until the action is tried again or no longer applies, and what was on screen before stays with it.
- **The shell notice**, above the page, for what outlives the page it started on. An import that fails after the user has moved on, a view that was brought back in step, a folder that cannot be shown: the user is no longer where it started, so the shell says it on whatever page is shown, names what it is about, and can be dismissed.
- **Never a toast and never a modal.** A toast leaves by itself, and an error must not. A failure does not stop the rest of the page from being used.

### Buttons

Plain and rectangular. A button names its action with a verb.

- **Shape:** height `--density-control-height`, horizontal padding `--space-3`, corner `--radius-sm`, text `--text-label`, optional leading icon at `--size-icon` with a `--space-1-5` gap. An icon-only button is square, has an accessible name, and has a tooltip.
- **Primary:** fill `--color-accent`, text `--color-text-on-accent`, no border. Hover `--color-accent-hover`. Active `--color-accent-active`. One primary button per region: Import in the top bar, and at most one on a page (for example "Import snapshot" on the import review). A primary button sits on `--color-surface-app` or `--color-surface-panel` only (the Two Surfaces Rule; the fills table under "Fills" is the checked form of it). On those two its fill clears 3:1 at rest and on hover in both themes. The pressed fill is under 3:1 in dark and is carried by the label for the length of the press.
- **Secondary:** transparent fill, `--border-width-thin` border in `--color-border-strong`, text `--color-text-primary`. Hover fill `--color-surface-hover`. Active fill `--color-surface-pressed`.
- **Quiet:** no border, transparent fill, text `--color-text-secondary`. Hover fill `--color-surface-hover` and text `--color-text-primary`. Active fill `--color-surface-pressed`. Inside an overlay the hover fill is `--color-surface-overlay-hover`.
- **Danger:** as secondary, with text and border in `--color-danger-text`. Hover and active fill `--color-danger-subtle`. Used only where the action destroys something and cannot be placed behind an undo.
- **Focus:** the focus ring, on every variant.
- **Disabled:** fill `--color-surface-disabled`, text `--color-text-disabled`, border `--color-border-default` where the variant has one. A quiet button has no fill when disabled, as at rest: only its text turns `--color-text-disabled`, so it never shows a box beside controls that have none. Not focusable. A disabled button says why in text beside it. A tooltip may repeat the reason for pointer users, but is never the only place it is given.
- **The reasons line:** the form that "says why in text beside it" takes for the primary button of a page, which can wait for several things at once and is the one button the user came to press. Its reasons stand directly under the row of buttons, `--density-stack-gap` below it, one sentence per reason, `--space-1` apart when there are several: `--text-body` in `--color-text-secondary`, at most `--layout-prose-max-width` wide, each naming what is missing and where ("Choose a column for Line ID."). The line is not an error: nothing is wrong yet, so it has no icon and no state color. It sits in a region that is always on the page and is announced politely when what it holds changes, because a disabled button cannot be reached by Tab; the button is described by that region. When the last reason goes, the line goes and the button is enabled in the same moment.
- **Which line says why.** Four cases, one rule each. The primary button of a page that waits for the user to do something has the reasons line above: body text, because it is what to do next. A control that is disabled only until something that is running has ended, such as the chips of the filter bar during a snapshot switch, has one sentence of `--text-caption` in `--color-text-muted` after the controls, in a place that is kept free for it, so that nothing moves when it comes and goes: it reports a state that will pass and asks for nothing. A control that waits for another control (the state below) has no line at all, because the control with the spinner says what is running. A control that is not the primary button of its page and is disabled for a reason the user can do something about, such as a group of choices that needs a value chosen first, has its reason in text beside it: one sentence of `--text-caption` in `--color-text-muted`, naming what to do. It is quieter than the reasons line because the control is not what the page waits for.
- **Loading:** the label stays, the leading icon becomes the spinner (`--size-icon`, one turn per `--motion-loop-period`), the button keeps its colors, ignores presses, and has `aria-busy`. The width does not change: a button without an icon that can become pending keeps the room of the spinner free at rest, half on each side of its label. That room is asked for where the button is built and is not a side effect of anything else, so a button that never waits is no wider than its label needs.
- **Waiting for another control:** an action shows its spinner on the control that started it, and on no other. While it runs, a control that would start a conflicting action, such as the snapshot selector while another workspace is being opened, is inert: it keeps its colors, its icon, its width, and its place in the Tab order, takes no hover or pressed fill, ignores presses, and has `aria-busy`. It shows no spinner and keeps the look of an enabled control. To assistive technology it is announced as unavailable and busy (`aria-disabled` and `aria-busy`), which is what it is for the moment. It needs no reason beside it: the one control with the spinner says what is running. A button that opens a menu follows the same rule and keeps its chevron. The inert state is the pending state of the component library without its spinner, and it keeps two side effects of that state, which a select's trigger has as well. When the control has the focus as it turns inert, or back, the library reads its name again, assertively, as it does for a button that starts to wait for its own action. And its name refers to a progress element that only the spinner provides; the reference finds nothing, and the name computation passes over it, so the name is unchanged. Neither contradicts the rule above: the control is still announced as unavailable and busy, with its own name, and shows nothing more. They are named here so that an upgrade of the pinned library checks that they are still the only ones.
- **Error:** a button has no error state of its own. A failed action shows an inline danger notice beside or under the button.
- **Transitions:** background, border, and text color over `--duration-fast` with `--ease-out`.

### Text field

- **Anatomy:** a label above (`--text-label`, `--color-text-secondary`), a `--space-1` gap, the field, a `--space-1` gap, and an optional helper line (`--text-caption`, `--color-text-muted`). A field always has a visible label; the placeholder is an example, never the label.
- **Field:** height `--density-control-height`, horizontal padding `--space-2`, fill `--color-surface-field`, `--border-width-thin` border in `--color-border-strong`, corner `--radius-sm`, text `--text-body` in `--color-text-primary`, placeholder in `--color-text-muted`.
- **Hover:** border `--color-text-secondary`.
- **Focus and active:** border `--color-accent-text` and the focus ring.
- **Disabled:** fill `--color-surface-disabled`, border `--color-border-default`, text `--color-text-disabled`.
- **Loading:** a spinner at the trailing edge inside the field; the field stays editable.
- **Error:** border `--color-danger-text`; the helper line is replaced by the message in `--color-danger-text` with an error icon, and the field has `aria-invalid` and `aria-describedby`. The message says what is wrong and what to type.

### Select

- **Trigger:** the same box as a text field, with the chosen value in `--color-text-primary` and a chevron icon in `--color-text-secondary` at the trailing edge. Hover, focus, disabled, and error are those of the text field. Loading shows the spinner in place of the chevron.
- **Open:** while the list is open the trigger keeps the focused look, border `--color-accent-text` and the focus ring, whether it was opened by key or by pointer. The chevron points up and the trigger has `aria-expanded="true"`. Its fill does not change.
- **List:** a menu on `--color-surface-overlay` with a `--border-width-thin` border in `--color-border-default`, corner `--radius-md`, `--shadow-overlay`, padding `--space-1`, at `--z-dropdown`. It opens as a menu does: it fades in and moves `--space-1` toward its place over `--duration-base`, and leaves by fading over `--duration-fast`, without moving.
- **Option:** height `--density-row-height`, horizontal padding `--space-2`, corner `--radius-sm`, text `--text-body`. Highlighted by pointer or arrow keys: fill `--color-surface-overlay-hover`. Chosen: text in `--font-weight-medium` with a check icon in `--color-accent-text` at the trailing edge. Disabled: `--color-text-disabled`.
- **Behavior:** a listbox, not the system control, so it looks the same on Windows and Linux. Arrow keys move, Enter chooses, Esc closes, typing jumps to a match.
- **Waiting for another control:** while an action that a choice here would conflict with runs, the select is inert, as a button is: it keeps its fill, border, value, chevron, and place in the Tab order, takes no hover border, does not open by pointer or by key, and has `aria-busy`. It shows no spinner; the control that started the action has it. To assistive technology it is announced as unavailable and busy (`aria-disabled` and `aria-busy`).

### Menu

A button that opens a short list of actions, or of choices, under itself: the workspace switcher, the snapshot selector. A menu holds things to do or to switch to. A value that belongs to a form is a select.

- **Button:** a quiet button with a chevron. Height `--density-control-height`, padding `--space-3` at the leading side and `--space-2` at the trailing side, corner `--radius-sm`, text `--text-label` in `--color-text-secondary`. An optional leading icon, the label, and a chevron at `--size-icon` in `--color-text-muted`, `--space-1-5` apart. The label is the current value ("Unit 573 piping") or the name of what the menu holds. A long label is cut at the end with an ellipsis; the button never grows past the room it is given, and its accessible name is always the full label.
- **Secondary form:** a menu button that stands among buttons, the Export menu in the top bar, is outlined as a secondary button is: a `--border-width-thin` border in `--color-border-strong` and text in `--color-text-primary`, with the same height, padding, and states. Unavailable, its border is `--color-border-default` and its text `--color-text-muted`.
- **Icon-only form:** where a labelled button has no room, as on an item of a list (the menu of a saved view, the saved views of the rail), the button is a quiet icon-only button (see "Buttons"): square, with the name of the menu as its accessible name and its tooltip, and no chevron. Its menu is the same overlay with the same keys.
- **Flush:** a menu button that starts a row of content, as the status control of the filter bar does, is moved out by its own leading padding and border, so that its label starts on the line of what stands above and below it and its hover fill reaches into the margin. The button does this itself, from the padding it has, so the two cannot drift apart.
- **Hover:** fill `--color-surface-hover`, text `--color-text-primary`.
- **Active and open:** fill `--color-surface-pressed` and text `--color-text-primary`, while the button is pressed and for as long as its menu is open. The button has `aria-expanded="true"` while it is open.
- **Focus:** the focus ring.
- **Loading:** while the action the menu started runs, the spinner takes the place of the chevron, the button keeps its colors and its width, opens nothing, and has `aria-busy`.
- **Waiting for another control:** as for a button: no spinner, the chevron kept, no hover or pressed fill, opens nothing, `aria-disabled` and `aria-busy` (an action runs).
- **Unavailable:** a menu that has nothing to act on, and will not until something outside it changes (the Export menu of a workspace without a snapshot). The button is greyed: label and chevron in `--color-text-muted`, no fill, and no hover or pressed fill. Muted text stays legible, as `--color-text-disabled` would not: on `--color-surface-app` 7.19:1 in the dark theme and 5.95:1 in the light, on `--color-surface-panel` 6.80:1 and 5.58:1 (the page header stands on the content area, the app surface; the rows of the contrast table above bind it at 4.5). The focus ring is unchanged and the button keeps its place in the Tab order, so its description can be reached. It opens nothing on a press, Enter, Space, or the down arrow, and is announced with `aria-disabled="true"`, never `aria-busy`, since nothing runs. Its accessible description (not shown) says why.
- **Disabled:** a menu button is never disabled. A menu with nothing to offer is not shown, and one that has to wait is in one of the two states above. The one exception is the Export menu (see "Export menu"), which is shown in the Unavailable state below until there is something to export.
- **Menu:** fill `--color-surface-overlay`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-md`, `--shadow-overlay`, padding `--space-1`, at `--z-dropdown`. It opens under the button, `--space-1` away, lined up with the leading edge of the button, or with its trailing edge for a button at the trailing side of the window, and above the button where there is no room below. It is as wide as its longest item, never narrower than its button or than `--size-menu-min-width`, and never wider than `--size-menu-max-width`. A menu that is taller than the room it has scrolls inside itself.
- **Opening:** it fades in and moves `--space-1` toward its place over `--duration-base`, and leaves by fading over `--duration-fast`: nothing moves while it goes. Under reduced motion it fades in place.
- **Item:** at least `--density-row-height` tall, horizontal padding `--space-2`, corner `--radius-sm`, the label in `--text-body` and `--color-text-primary`, on one line. An item may carry a detail after its label, `--space-4` away at the trailing side: `--text-caption` in `--color-text-muted`, with tabular figures ("9,241 holds"). The detail describes the item to assistive technology; it is not part of its name. An action is named by a verb, a choice by its name.
- **Highlighted:** by the pointer or by the arrow keys, fill `--color-surface-overlay-hover`. The item the keyboard is on also shows the focus ring, inset. An item the pointer is on shows the fill only, so the ring does not follow the pointer down the menu.
- **Active (pressed):** the highlighted fill stays; the menu closes on release.
- **Chosen:** in a section that holds a choice, the chosen item is written in `--font-weight-medium` and carries a check icon in `--color-accent-text` at its trailing edge. Every item of that section keeps the room of the check, so the details line up. The items are announced as a set of which one is checked.
- **Disabled item:** label and detail in `--color-text-disabled`; the arrow keys pass it by.
- **Section:** a group of items under its name. The name is a line of `--text-caption` in `--color-text-muted`, as tall as an item and lined up with the labels.
- **Separator:** a `--border-width-thin` line in `--color-border-default` from edge to edge of the menu, with `--space-1` above and below. It is the default border and not the subtle one, which has the lightness of the overlay surface itself in the dark theme.
- **Submenu:** an item that opens a menu of its own, for one action that applies to one of several things ("Chart as PNG" to one of four charts). It is an item with a chevron pointing right at its trailing edge, at `--size-icon` in `--color-text-muted`, and `aria-haspopup="menu"`. Its menu is the same overlay, named after the item, and opens beside it on the trailing side (on the leading side where there is no room), its first item level with the item it opens from; it moves `--space-1` toward its place as it opens. While it is open the item keeps the highlighted fill. A press, Enter, Space, or the arrow toward it opens it with the focus on its first item; the arrow back or Esc closes it and gives the focus back to the item; choosing in it closes every menu. It also opens after a pause under the pointer, which is never the only way. One level only: a submenu holds items, not submenus.
- **Behavior:** Enter, Space, or the down arrow opens the menu. The arrow keys move, Home and End jump to the ends, typing jumps to a match, Enter or Space chooses and closes. Esc, or a press outside, closes without choosing. Closing gives the focus back to the button.
- **Error:** a menu has no error state of its own. What an item started and failed is shown where the error rule of "Where an error goes" puts it.

### Export menu

The menu of a data screen (Overview, Breakdown, Lines, Blockers) that saves or copies what the screen shows. It is a "Menu" with nothing of its own but its items and where it stands.

- **Place:** in the top bar, at its trailing end, between the snapshot selector and Import, on every page (Import stays the last control); its menu opens below the button and lines up with its trailing edge. The button reads "Export", without an icon. The page header holds no Export menu. The page in view fills a slot of the top bar with its own menu, and only one page is in view; the slot is filled before the first paint of the page, so the unavailable button never shows in front of a menu. The export notice stays directly under the page header.
- **Items,** in three groups divided by separators, and the choice of columns and rows after them: what is saved ("Excel, this view…", "Full workbook…", "CSV…", "Status report (PDF)…"); what is copied ("Copy table", "Copy selected rows (3)", "Copy line IDs"); the charts ("Chart as PNG…", "Chart as SVG…", "Copy chart"). An item names the result, not the mechanism. An item that saves ends in an ellipsis, since the save dialog follows; a copy does not. Each runs at once with the columns and rows remembered for the screen.
- **What a screen offers:** an item that does not apply is left out, never disabled. The Overview has no CSV and no copy of a table (its view is several tables), and its four charts (by discipline, by hold type, by role, top blockers) are in a submenu of each chart action ("Chart as PNG" › "Open holds by discipline…"). The matrix of Breakdown writes its holds cross-tab only, and its items say so ("CSV (holds)…", "Copy table (holds)"); it has no rows to copy by line. "Copy selected rows" is there while at least one row is selected, with their count, and the status the exports apply is the one the rows were read under. A screen that shows no row offers no copy of its table or its line IDs. Lines has no chart.
- **Without a snapshot, and on other pages:** the button is still in the top bar, in the "Unavailable" state of the Menu: greyed, `aria-disabled="true"` and not busy, focusable, and it opens nothing, on a press, Enter, Space, or the down arrow. Its accessible description, from the catalog, says why: on a data screen of a workspace without a snapshot "Import a snapshot to export", on every other page (Settings, the screens that are not built, the import flow, the list of workspaces with none open) "Open Overview, Breakdown, Lines, or Blockers to export"; nothing is shown by hover alone, and `Ctrl+E` does nothing. This is the stated exception to the Menu rule that a menu with nothing to offer is not shown: the action is fixed, a page the user knows always has it, so it is shown unavailable until a snapshot exists rather than appearing and disappearing.
- **Waiting:** while the screen's own result is not there (a first load, or older rows or numbers standing in, dimmed, while the new ones are read), and while a workspace or snapshot is being switched, the button waits as for another control: its chevron, no hover, opens nothing, `aria-busy`; `Ctrl+E` does nothing.
- **Running:** from the press until the file is saved or the copy is made, the save dialog included, the button shows the spinner in place of its chevron and opens nothing, and the controls of the export notice are inert, so a second export cannot start. Once the save command runs, the button's name says its phase ("Export, reading the view…", then "Export, writing the file…"). The result is a toast ("Saved Lines.xlsx" with "Open file" and "Show in folder", or "Copied 3 rows").
- **Failure:** a danger notice directly under the page header, above the view switch and the filter bar, `--space-4` above what follows ("Where an error goes": beside what failed). It says what failed and the command's message, offers "Choose another name" (a file another program holds, another extension, a folder that is not there, a place that cannot be written) or "Try again" (a file another program holds, a clipboard that refused) where they help, and stays until it is dismissed, the next export of the page (a save or a copy) has a result, or another workspace or snapshot is put in view. One notice stands at a time. A save dialog that could not be opened is said as such ("The save dialog could not be opened, so nothing was saved"), with its message.
- **Shortcut hint:** "Excel, this view…" carries `Ctrl+E` as its detail, at the trailing side in `--text-caption` and `--color-text-muted`, and has `aria-keyshortcuts="Control+E"`. No other item has a shortcut.
- **Keyboard:** `Ctrl+E` saves the view as Excel, as the first item does, also while the focus is in a table; never while a text field has the focus or an overlay is open (a menu, a list, a popover), and not while the button waits or an export runs.
- **Columns and rows:** the last item, after a separator, is "Columns and rows…", which opens the panel of that name (see "Columns and rows panel"). It is there on Lines (both modes), the list of Breakdown, and Blockers, whose files have columns and rows to choose; not on the Overview or the matrix, whose files are fixed tables.
- **A choice that falls back:** when the rows remembered for the screen are the selected ones and none is selected, the items that write rows say what they write instead: "Excel, this view (all rows)…", "CSV (all rows)…", "Copy table (all rows)", "Copy line IDs (all rows)".
- **A remembered status:** a status other than "As the filters" is named in every item, which all export under it: "Excel, this view (released holds)…", "Chart as PNG (released holds)". When it is not the status the rows on screen were read under, the items write every row it keeps, in the order of the file: "Copy selected rows" is left out, and the items that would have written the loaded or the selected rows say so ("Excel, this view (released holds, all rows)…").

### Columns and rows panel

What "Columns and rows…" of the Export menu opens: a popover in which the columns and rows the exports of a screen write are chosen, and kept as that screen's default. It is a popover, not a modal: the page stays as it is behind it.

- **Place:** under the Export button, lined up with its trailing edge, `--space-1` away. The button keeps its open look (fill `--color-surface-pressed`, `aria-expanded="true"`) for as long as the panel is open.
- **Anatomy,** from top to bottom and in Tab order: the title, a section title of level 2 that names the screen ("Columns and rows of Lines"), which is also the name of the dialog; "Rows", a choice group; "Status", a choice group; "Columns", a label in `--text-label` and `--color-text-secondary` with two quiet buttons after it at the trailing side, "All" and "Only the row's name", and under it the checkboxes of the columns; then the row of the two buttons at the trailing side, "Save as default for Lines" and "Cancel". The parts are `--density-stack-gap` apart.
- **Rows:** "All 9,241", every row the filters keep, counted as the table counts them; "Loaded 200", only on a table that loads its rows by pages (Lines) and while fewer than all are loaded; "Selected 3", only while rows are selected. Under a status other than the one the rows on screen were read under, only "All" is offered, uncounted, with one line under it that says why: the rows on screen are those of the filters' status. A remembered choice whose option is not offered shows "All", and saving keeps "All": the panel saves the rows it shows.
- **Status:** "As the filters", "Open", "Released", "All". Any but the first replaces the status of the filters for the exports of this screen only; the filter bar does not change.
- **Columns:** one checkbox per column of the screen's file, in the file's order (that of the table, except on Blockers, whose file leads with the Blocker while the row header of its table is the Step), named as the table names it; a column the snapshot has no value in is not listed, nor one the chosen status does not write (the release date of an open hold). The column that names the row, the row that the file leads with (the line on Lines, the group on Breakdown, the blocker on Blockers, where the step is an ordinary column right after it), is checked and disabled, with "Always written" after its name in `--text-caption` and `--color-text-muted`. "All" checks every column; "Only the row's name" leaves that one alone. When the columns are more than the window has room for, their list scrolls inside the panel and the rest of it stays.
- **Saving:** "Save as default for Lines" keeps the choice for the screen, on this computer, and closes the panel; every item of the menu exports with it from then on. It is the main action of the panel and stands first, but it is a secondary button: the panel lies on the overlay surface, which carries no primary button (the Two Surfaces Rule). "Cancel", a quiet button, closes the panel and changes nothing, as Esc and a press outside do.
- **Focus:** opening moves the focus to the panel itself, which shows the inset focus ring: it holds no field and no list. Tab moves through its controls and stays inside. Closing, by either button, Esc, or a press outside, gives the focus back to the Export button.
- **Nothing to confirm elsewhere:** this is the one popover with buttons that confirm, because what is chosen in it applies to files not yet made, and nothing on the screen shows it at once.
- **Loading, error, empty, disabled:** not applicable. The panel opens only while the menu can, so the screen's rows are there; the counts come from the screen; a screen always has the column that names its rows.

### Checkbox

- **Anatomy:** a box of `--size-checkbox` with corner `--radius-xs`, a `--space-2` gap, and a label in `--text-body`. The whole row is the target and is at least `--density-control-height` tall.
- **Unchecked:** fill `--color-surface-field`, `--border-width-thin` border in `--color-border-strong`. Hover: border `--color-text-secondary`. Active (pressed): fill `--color-surface-pressed`, border `--color-text-secondary`.
- **Checked:** fill `--color-accent`, border `--color-accent-text`, a check mark in `--color-text-on-accent` with a `--border-width-thick` stroke. Hover: fill `--color-accent-hover`. Active: fill `--color-accent-active`.
- **Mixed:** as checked, with a dash in place of the check mark.
- **Focus:** the focus ring around the box.
- **Disabled:** fill `--color-surface-disabled`, border `--color-border-default`, mark and label in `--color-text-disabled`.
- **Loading:** not applicable; a checkbox applies at once.
- **Error:** border `--color-danger-text` and a message under the group in `--color-danger-text` with an icon.

### Choice group

One choice out of a few that are all worth seeing at once: "Is" or "Is not" in the filter picker. With more than five options, or where room is short, the choice is a select.

- **Anatomy:** a label for the group above (`--text-label`, `--color-text-secondary`), a `--space-1` gap, then the options. An option is a circle of `--size-checkbox` with corner `--radius-full`, a `--space-2` gap, and a label in `--text-body` and `--color-text-primary`. The whole row is the target and is at least `--density-control-height` tall. An option may carry one line of description under its label, starting where the label starts: `--text-caption` in `--color-text-muted`.
- **Layout:** the options stand one under the other. Two or three options with short labels and no description may stand in a row instead, `--space-4` apart; they wrap as whole options when the row is too narrow.
- **Unchosen:** fill `--color-surface-field`, `--border-width-thin` border in `--color-border-strong`. Hover: border `--color-text-secondary`. Active (pressed): fill `--color-surface-pressed`, border `--color-text-secondary`.
- **Chosen:** fill `--color-accent`, border `--color-accent-text`, and a dot of `--size-radio-dot` in `--color-text-on-accent` in the middle. Hover: fill `--color-accent-hover`. Active: fill `--color-accent-active`. These are the steps of a checked checkbox, so the two marks read as one family; the shape tells them apart.
- **Focus:** the focus ring around the circle. The group is one stop in the Tab order: Tab reaches the chosen option, the arrow keys move to the next or the previous option and choose it, and the choice wraps at both ends.
- **Disabled:** the whole group. Circles take fill `--color-surface-disabled` and border `--color-border-default`; dot, labels, and descriptions take `--color-text-disabled`. Not focusable. The reason is given in text beside the group.
- **Loading:** not applicable; a choice applies at once.
- **Error:** not applicable; one option is always chosen, so the group cannot be left in a state that is wrong.

### Table

The center of the product. It behaves like a spreadsheet grid and looks like a ruled page.

- **Container:** none. The table sits directly on `--color-surface-app` and fills the content area. No card, no outer border, no zebra stripes.
- **Height:** one of two, and the page decides which. A table that is the page (Lines, Breakdown, Blockers) fills the height it is given and scrolls inside it. A table in the flow of a page is as tall as its rows up to a number of them, twelve unless the page says otherwise, and scrolls inside itself past that, with a scrollbar along its lower edge given room of its own so it covers no row; a table that is read whole, such as a group of Overview, has no such limit and the page scrolls.
- **Header row:** stays at the top of the table at `--z-sticky`, height `--density-header-height`, fill `--color-surface-raised`, bottom hairline in `--color-border-default`, text `--text-label` in `--color-text-secondary`. Once rows scroll beneath it, the header gains `--shadow-raised`.
- **Sortable header:** a button, and it looks like one before it is pressed (owner's answer of 2026-10-17).
  - *At rest:* after the label, `--space-1` away, a sort mark: a two-way mark (chevrons up and down) at `--size-icon` in `--color-text-muted`. It says the header sorts, not which way; a press sorts the way the column comes first (largest or newest first for a count, an age, or a size, from A for a name), and the arrow then shows it. A header that cannot be sorted has no mark, so the mark alone tells the two apart. Its room is kept in the width of the column, so nothing moves when it changes.
  - *Hover:* fill `--color-surface-hover`, label `--color-text-primary`, mark `--color-text-secondary`.
  - *Active (pressed):* fill `--color-surface-pressed`, label `--color-text-primary`.
  - *Focus:* the inset focus ring; the mark takes `--color-text-secondary`, as on hover, since the keyboard has no hover.
  - *Sorted:* the one header with an arrow, pointing the way the rows are sorted, and its label in `--font-weight-semibold`; label and arrow in `--color-text-primary`. It differs from a header at rest by shape (an arrow, not the two-way mark) and by weight, not by ink alone, so it is found at a glance in a row of sortable headers (review of 2026-10-18). The label's room is counted generously enough for the heavier weight. A press turns the order round. The header has `aria-sort`; the others have `aria-sort="none"`.
  - *Disabled:* during a first load no header can be sorted, and none shows a mark.
- **Which tables sort:** every column of every table, wherever the rows allow it (owner, 2026-10-18).
  - *Paged tables* (Lines, the hold rows): Rust sorts them, and the address keeps the sort.
  - *Tables the screen holds whole:* the screen orders the rows the command returned, by the values the command returned, and asks for nothing. Text sorts as a reader expects (case and accents aside, "Item 2" before "Item 10"), numbers and dates as such, a row without a value stays last in both directions, and rows of equal value keep the order they came in. Until a header is pressed the rows are in the command's order and no header is marked. Breakdown's groups (the share sorts by the holds) and Blockers' steps keep their sort in the address (`sort=<column>&dir=<asc|desc>`); Breakdown drops it with another dimension, and the lines under an expanded group keep the order they were read in. The curve of Blockers keeps the order of the steps whatever the table's sort, and a step selected past the steps handed to the table is handed over with the rows before it in the table's order. The table view of every chart, the Overview's group tables, and the Welcome list of workspaces keep their sort while they show, and not after; the folded "All others" row of a heatmap stays last in both directions. Another sort is another result: the table returns to its top, or to its selected row.
  - *Two tables do not sort.* The preview of the import mapping shows the first rows of the file in the file's order, so that a column can be recognized by what it holds. The skipped rows of the import review are a sample of them, and a sorted sample misleads. The lists of the detail panel are lists, not tables, and keep their order.
- **Row:** height `--density-row-height`, cell padding `--density-cell-padding-x`, bottom hairline in `--color-border-subtle`, text `--text-table` in `--color-text-primary`. Supporting columns use `--color-text-secondary`. Numbers are right-aligned with tabular figures. Line IDs use `--text-mono`; a blocker item uses the body face of the row (see the Identifier Rule). One line per row; long text is cut at the end with an ellipsis and shown in full in the detail panel. The whole text stays in the cell for assistive technology, so nothing depends on a tooltip.
- **Column widths:** declared by the page, never measured from what the cells hold, because only the rows near the visible part exist. A column has one of two sizes. A number of characters: the column is that many figures of its typeface wide, plus the cell padding at both sides; a figure is the widest character of the table face and every figure is as wide as the next, so a column of numbers is declared by its longest number, and in the monospace face every character is one. Or a share: the column takes its share of the width the other columns leave, and is never narrower than a number of characters it declares. The width of a figure is measured in each of the two faces once the fonts are there, so the widths follow the fonts, the root size, and the density.
  - A column is never narrower than its header needs, with the arrow where the header can be sorted. A header is never cut, except in the table view of a chart (see "Chart table view").
  - An identifier is never cut: its column is declared from the widest value of the whole result, which the command sends with the rows.
  - A column of running text is declared by a count of its text in which a figure counts in full and any other character as 0.85 of one, since letters are narrower than figures. Text that is longer is cut with the ellipsis.
  - One column takes a share wherever the table may be wider than its columns, so the last column reaches the edge. The hairlines run the width of the table either way.
- **Column priority:** a column may have a priority, a whole number; a column without one always stays. When the table is narrower than all of its columns at their least widths, the column with the highest number leaves, then the next, until the rest fit. The page gives a priority only to a column whose value is in the detail panel of the row, so what leaves stays one press away, and it orders them by what a reader of that table asks for least. Three columns never leave: the column that names the row; the column the rows are sorted by, so the arrow that says the order stays in view; and the last column that takes a share of the width, so the rows still reach the edge of the table. A column with a priority can only be given to a table that is also given the sentence that names what left (it is a type error otherwise), so nothing leaves silently. When the cell or the header that has the focus leaves, the focus goes to the cell that names the same row, or to the header of that column, and is never left on the page behind. Which columns leave follows the width the table has (the window, the sidebar, the panel beside it), is worked out again whenever that width changes, and returns the columns as soon as there is room. Nothing moves in between: a column is there whole or not at all.
- **Columns that left are named.** Under the table, at the trailing end of the count line (or in its place when the page writes none), one sentence in `--text-caption` and `--color-text-muted` names them and says where to read them ("Not shown at this width: Model size, LDT size. Open a line to read them."). It is not a live region: a resize is not news. It describes the table, so assistive technology hears it with the count.
- **Sideways scroll:** when the columns that are left still need more than the table is wide, no column gives way: the table scrolls sideways. The column that names the row, the first one, is pinned: it stays in view over the columns that scroll beneath it, in the header as well, and carries the fill of its row. Once the table is scrolled sideways, a `--border-width-thin` line in `--color-border-default` marks the edge of the pinned column. It is a hairline and not a shadow.
- **Rows load as the table is scrolled.** A long result arrives a page at a time. When the last row that is loaded comes within the height of the visible part, the table asks for the next page: once for each time the end comes near, and again only after rows were added, so a page that brings nothing is not asked for twice. Only the rows near the visible part are in the document; the row that has the focus stays in it while it is scrolled away, so the focus is never lost to the page. The page says when the rows are another result, as after another filter or sort; the table then returns to its top, and the end of the other result counts as a new end. Nothing else is taken for another result: rows that are added, a result that is read again and lost a row, a first row that changed, all keep their place. Only a table that scrolls inside itself asks for more rows: one that is as tall as its rows has its end in view at all times, so it asks for none.
- **At most 5,000 rows are loaded.** A table stops asking for more once 5,000 rows are there. A filter change re-renders the rows that are loaded: up to 5,000 it stays well under a tenth of a second in a production build, from 30,000 it took about a third of one (decision of 2026-10-13). The count line then says how many rows are shown of how many there are, and that the others are reached by narrowing the filters or by reversing the sort ("5,000 of 9,312 holds are shown. Narrow the filters or reverse the sort to reach the others."). The limit is one constant of the page that loads the rows. A page that has all of its rows at once, as the steps of Blockers, hands them to its table by the same rule: the first 200, then 200 more each time the end comes near, up to 5,000, since what a filter change costs follows the rows handed over, not the rows drawn. Its count line says the same in its own words ("200 of 11,894 steps", "5,000 of 11,894 steps are shown. Narrow the filters to reach the others."). A row selected from outside the table (a point of the curve, the address) is handed over with the rows before it, past 5,000 when it lies there, so it can be brought into view; those rows stay handed once the selection ends, so the row the user was on does not leave the table.
- **Load-more row:** while a page is on its way, one row of skeleton lines stands under the last row, at the row height, with the same hairline. It is a picture and not a row: it takes no focus and the arrow keys stop at the last row above it.
- **Count line:** under a table whose page writes one, outside what scrolls: how many rows are loaded and how many there are, in the page's own words and with formatted numbers ("200 of 3,612 lines"). `--text-caption` in `--color-text-muted` with tabular figures, padding `--space-2` above and below and `--density-cell-padding-x` at the sides, so it starts where the first column does. Under a table that fills its page a hairline in `--color-border-default` stands between the rows and the line. While a page is on its way the line keeps the count and adds a second sentence after it ("200 of 3,612 lines. Loading more rows"); the count does not move. The line is a status region, so both are announced politely, and it describes the table. The table always says how many rows there are: a table that shows all of its rows keeps its line, with the count alone ("37 lines"). Only an empty table shows no count line, because its empty state says that nothing is there; the count is still heard, as the same status region and the description of the table. A read-only table that is all there, and whose page writes no count line, gives its count only as its description: it is no status region, because its rows change with the page, which announces that change itself.
- **Rows that expand:** a row may hold rows of its own, as a group of Breakdown holds its lines (the owner's choice of 2026-10-17: a group expands in place). The table is then a tree grid.
  - *Chevron:* the cell that names the row starts with a chevron (`ChevronRight` at `--size-icon`, in `--color-text-secondary`, `--color-text-primary` on the row's hover), `--space-1` before the name. It points to the side while the row is collapsed and turns down when it expands, a quarter turn over `--duration-fast`; under reduced motion it turns at once. A row without children keeps the room of the chevron, so every name starts in one place. The column that names the row is that room wider than it declares. The chevron is for the pointer: the row says to assistive technology whether it is expanded (`aria-expanded`, `aria-level`), and the keyboard turns it, so the chevron takes no focus and is not read.
  - *Turning:* a press on the chevron turns the row; so does a press on the row and Enter, on a table whose rows are not selected themselves (Breakdown). Right expands the focused row, Left collapses it; Left on a child row goes to its row. The page holds which rows are expanded and keeps them in its address.
  - *Child row:* a row like the others, at the row height, with the same hairline and hover. Its cells stand in the tracks of the table's columns and say what the child has in each: a line ID in the track of the group's name, in the monospace face, its holds under the holds. The cell that names it is indented by the room of the chevron, so its name starts under the name of its row. A child row that opens something is selected as any row is (the line in the detail panel), with the selected tint; the same child under two rows is marked under both.
  - *Loading child row:* while the children are read, one row of skeleton lines in the tracks stands for them, as the rows of a first load do. It is a picture: it takes no focus, and assistive technology reads "Loading the rows of this group" once.
  - *Error child row:* when they could not be read, one row across the tracks: the danger icon in `--color-danger-text`, the command's own message (it says what happened and what to do; the row stands under its row, so it needs no sentence of its own, and the message is not cut at 1280 px), and a quiet Retry button. Enter on the row retries as well. The rows of the table stay.
  - *Notice child row:* when there is nothing to show for a reason the page knows, one row across the tracks says it in `--color-text-secondary`, with a quiet button for what to do: a Breakdown group the filters no longer keep, and Collapse. Enter on the row does the same.
  - *Leading-on child row:* when the row has more children than are shown, a last row across the tracks says where to read them all ("Open all 900 lines in Lines"), in `--color-accent-text` with an arrow after it: it is an action. A press or Enter follows it.
  - *Count line:* counts the rows, not their children.
  - *Turning is one render:* the children a page has read stay in the table, out of sight, while their row is collapsed, so turning a row whose children are there changes only which rows are drawn. Breakdown keeps the lines of the groups that are open and of the last ten it closed. When a row collapses around the focused row, by any way (Left, the chevron, a notice row's action, an address that changed), the focus goes to that row, so the keyboard is never left among rows that are not drawn. A row of a result that is being replaced (the groups of the dimension before, dimmed) does not expand.
  - *Selection:* a row that can never be selected, in a table whose other rows can, does not say "not selected": it carries no `aria-selected`.
- **Hover:** fill `--color-surface-hover`.
- **Selected row:** fill `--color-accent-subtle`, hover `--color-accent-subtle-hover`, `aria-selected`. Selection is a tint across the whole row. It is never a stripe on one edge.
- **Selected rows:** a page that keeps a selection beside the open row (the row whose detail is open) lets several rows be selected, as in a spreadsheet (owner, 2026-10-18). The open row works as it always has; the selection stands beside it.
  - *Pointer:* a press on a row opens it and selects it alone. Ctrl and a press adds the row to the selection or takes it out, without opening it; Ctrl is Ctrl on every system the app runs on. Shift and a press selects the loaded rows from the last row pressed to this one, also when that press took the row out, without opening it.
  - *Keyboard:* Enter opens the focused row and selects it alone, as a press does; Ctrl+Enter and Shift+Enter do the same. Ctrl+Space adds the focused row to the selection or takes it out, without opening it, as Ctrl and a press do (the convention of lists on Windows). Shift+Space selects the loaded rows from the last row pressed to the focused one, as Shift and a press do. Shift+Up and Shift+Down move the focus by a row and extend the same range; at the last loaded row Shift+Down stays there. Ctrl+A selects every row that is loaded, and no other. Esc clears the selection; the page's own Esc closes the panel in the same press.
  - *Rows that turn:* on a table whose rows are turned by a press rather than opened (the groups of Breakdown), a press or Enter turns the row and leaves the selection as it is; Ctrl and Shift select as above.
  - *Which rows:* child rows of an expanded row are not selected by these keys, and a range runs over the rows, past their children. The page is handed the keys in the order of the rows. The panel shows the last row opened.
  - *Look:* a selected row has the tint of the selected row (`--color-accent-subtle`, hover `--color-accent-subtle-hover`) and `aria-selected="true"`; the others `aria-selected="false"`, and the grid has `aria-multiselectable="true"`. Teal marks the selection, and nothing else changes on a selected row.
  - *The open row among them:* when the selection holds other rows than the open one, the open row has a deeper tint, `--color-accent-open` (hover `--color-accent-open-hover`), and `aria-current="true"`; it keeps `aria-selected` for whether it is in the selection, also when Ctrl took it out (owner, 2026-10-19). There is no outline: the focus ring is the only line around a row, so the open row and the focused row never look alike. Row text in all three inks clears 4.5:1 on both tints and their hover steps in both themes (Contrast pairs).
  - *The mark:* the open row among two or more selected rows also carries a small dot at the start of its first cell, on top of its deeper tint: `--size-open-mark` across, round, in `--color-accent-text` (the accent as ink; `--color-accent` itself is too close to the deeper tint in the dark theme), centered in the cell's padding, drawn over it and out of the flow, so no text and no column moves, at either density. It is a dot and not a stripe, since a colored stripe on one edge of a row is banned. It is decoration (`aria-hidden`): the row says it is current by `aria-current`. The open row alone in the selection, an open row taken out of the selection, and a selection without an open row show no dot. It follows the selection at once, with no motion.
  - *The open row alone:* when the selection is empty or holds the open row alone, the open row looks and is announced as it always was: the tint of the selected row and `aria-selected="true"`.
  - *Count line:* adds the selection after the count, in the page's words, joined by a comma ("400 of 9,312 lines, 3 selected"), whenever a row is selected. It is the same status region, so a change of the selection is announced politely, and the description of the grid says it as well.
  - *Whose it is:* the page holds the selection. It stays while more rows load, and the page clears it for another result (another filter, sort, or snapshot), when the rows it named are gone.
- **A selection made elsewhere:** where the page selects a row from outside the table as well (the curve of Blockers selects the step of its point), the table brings the selected row into view when the selection changes, when the row arrives after it, and in another result that holds it (another filter), where it takes the place of the return to the top: scrolled the least that shows it whole, under the header or at the lower edge, without motion and without moving the focus. A row in view stays where it is, and the user may scroll away from it.
- **Focus:** the inset focus ring on the row or cell. Arrow keys move it by a row, Page Up and Page Down by the height of the visible part, Home and End to the first and the last row that is loaded; Enter opens the detail panel; Esc closes the panel and returns focus to the row. A row that takes the focus is scrolled clear of the header and of the pinned column, at the width the pinned column has.
- **Active:** fill `--color-surface-pressed` while pressed.
- **Disabled:** a table has no disabled rows. A column that needs data the snapshot lacks is hidden, and the filter bar says once which column of the export it needs (see Filter bar, "Missing columns").
- **Loading:** a first load shows skeleton rows at the current density, each line in the room of its column. A refetch keeps the previous rows at `--opacity-stale` until the new rows arrive.
- **Error:** an inline danger notice above the table; the previous rows stay.
- **Empty:** the empty state, inside the table area, under the header row.

### Tabs

- **Tab list:** a row with a bottom hairline in `--color-border-default`.
- **Tab:** height `--density-control-height`, horizontal padding `--space-3`, text `--text-label` in `--color-text-secondary`.
- **Hover:** text `--color-text-primary`, fill `--color-surface-hover`.
- **Selected:** text `--color-text-primary` and a `--border-width-thick` indicator in `--color-accent-text` on the bottom edge. The indicator is moved and scaled to the new tab with `transform` over `--duration-base`; its size is never animated.
- **Focus:** the inset focus ring. Left and right arrows move between tabs.
- **Active:** fill `--color-surface-pressed`.
- **Disabled:** text `--color-text-disabled`. The reason is given in text on the page, in the panel that is shown; a tooltip on the tab may repeat it.
- **Loading and error:** belong to the tab's panel, not to the tab.

### View switch

Two to four views of one content: on Lines, a row per line or a row per hold. It looks like a tab list, because it sits where tabs sit and does what tabs seem to do, but it is a choice: every view shows the same place of the page in another way, so there is no panel per view.

- **Anatomy:** a row with a bottom hairline in `--color-border-default`, directly under the page header. Each view is a label: height `--density-control-height`, horizontal padding `--space-3`, text `--text-label` in `--color-text-secondary`, corners `--radius-sm` at the top.
- **Chosen:** text `--color-text-primary` and a `--border-width-thick` indicator in `--color-accent-text` on the hairline, as wide as the view. The indicator appears in place, fading in over `--duration-fast`; it does not travel.
- **Hover:** text `--color-text-primary`, fill `--color-surface-hover`. **Active:** fill `--color-surface-pressed`.
- **Focus:** the inset focus ring. It is a named radio group: one stop for Tab, and the arrow keys move to the next or the previous view and choose it, so the content follows the focus; Space and Enter choose the view that has the focus, as on a button.
- **Disabled, loading, error:** not applicable. A view applies at once; what loads and fails is the content, which keeps the rows of before, dimmed, until the rows of the chosen view are there.

### Preset row

The questions asked of a table most often, each one press away: on Lines, All, Single hold, Easiest to release, Oldest first, Size mismatch. It stands under the filter bar, at the leading edge, above the table.

- **Anatomy:** quiet buttons in one row, `--space-1` apart: height `--density-control-height`, horizontal padding `--space-3`, corner `--radius-sm` (square: a preset is a query, not a filter that can be removed), text `--text-label` in `--color-text-secondary`. The row wraps when it is narrower than its presets.
- **Marked:** the preset that is the query of the page has fill `--color-accent-subtle` and text `--color-text-primary`; hover `--color-accent-subtle-hover`. One preset is marked when the query is exactly that preset, and none otherwise, as after a sort by a header that no preset has. A preset whose sort is a column's also shows that column's arrow (All marks Holds, Oldest first marks Oldest), so a press on that header turns the order round at once and the preset is no longer marked.
- **Hover:** fill `--color-surface-hover`, text `--color-text-primary`. **Active:** fill `--color-surface-pressed`.
- **Focus:** the focus ring. It is a named radio group: one stop for Tab, and the arrow keys move to the next or the previous preset and choose it, so the table follows the focus; Space and Enter choose the preset that has the focus, as on a button. Choosing the marked preset again changes nothing.
- **Waiting:** until the options of the snapshot are read, the row keeps its height and shows no preset, so none appears that will go.
- **Missing data:** a preset that needs a column the snapshot has no value in is not offered (Size mismatch without the model or the LDT size); the filter bar says once which columns are missing.
- **Empty:** a preset that keeps no row has the empty state of the table say which preset it is, and offer All.
- **Loading and error:** belong to the table.

### Overview

The page a lead runs the weekly review from, on a wall screen as on a laptop: how many holds, how old, who must act, and what they wait for. It is a page of content width, roomy, and read across.

- **Order:** the stat tiles; the bars by discipline, by hold type, and by role; "Top blockers" and "Top lines"; "Needs attention". Each part after the tiles is a section with a section title of level 2, and the parts are `--space-8` apart.
- **Layout:** the sections after the tiles sit two to a row, in that order, left to right and then down, each column at least two and a half label columns wide (`--size-bar-label-width`) with `--space-12` between the columns. A content area too narrow for two such columns stacks them in one. So from 1280 px up the page reads in three rows of two, and at 1024 px in one column, and nothing on it is cut or pressed together at either width.
- **Groups:** the three groups are bar rows that filter: a press adds that value to the filters, in place of the entry its field had, and opens Lines. Each has its "Show as table" switch.
- **Top blockers and top lines:** the ten blockers and the ten lines with the most of the holds the filters keep, as the command sends them, each a bar row with its label and its holds and no second value. A row opens what it names (see "Bar row", "Opening row"): a blocker opens Blockers with that blocker selected in the panel, under the filters that are set; a line opens Lines, a row per line, with that line selected in the panel. A line ID is written as an identifier. A list without rows says so in one line, as a group does.
- **Needs attention:** the open holds the filters keep that have waited at least as long as the command says (90 days), as one entry: "903 holds open for 90 days or more". It is a list ruled like a fact list, a hairline in `--color-border-subtle` above its first entry and one under each. The entry is one button as wide as its column, at least `--density-row-height` tall, padding `--space-2`, corner `--radius-sm`, `--space-3` between its parts: a warning tag with its icon ("Stale"), because a hold that old is a real state; the sentence in `--text-body-strong` and `--color-text-primary`, tabular figures; and at the trailing edge a chevron at `--size-icon` in `--color-accent-text`, which says before it is hovered that the entry opens a screen. Hover fill `--color-surface-hover`, active fill `--color-surface-pressed`, the inset focus ring. A press opens Lines with a row per hold, the Oldest first sort, the status set to the open holds, as stale holds are (the age band alone would also keep a released hold whose duration is that long), and the age filter set to the band of the stale holds (90 days and more) in place of the age bands it had; every other filter stays. So Lines shows exactly the holds the entry counts. When no hold is stale the section holds one quiet line in its place, `--text-body` in `--color-text-secondary`, with no tag and nothing to press: "No hold has been open for 90 days or more.", or with filters set "None of the holds the filters keep has been open for 90 days or more." When the age of the holds cannot be known, because the filters keep open holds and none of them has a creation date (the command says so with the stale count), the line says that and not that none is stale: "How long the holds have been open is not known: no open hold has a creation date."
- **Every number leads to the screen that shows it:** "Lines on hold" opens Lines with the All preset, the tile of the lines with one hold opens Lines with the Single hold preset, a bar of a group filters and opens Lines, a top blocker opens Blockers, a top line opens Lines, and the stale holds open Lines. The open holds and the median age have no screen behind them yet, and their tiles are static.
- **Naming by status:** the page shows the holds the status of the filters keeps, and names them after it, so nothing on it calls a released hold open.

| Part | Open (the default) | Released | All |
|---|---|---|---|
| The tiles | "Figures of the open holds" | "Figures of the released holds" | "Figures of the holds" |
| First tile | "Open holds" | "Released holds" | "Holds" |
| Second tile | "Lines on hold" | "Lines with released holds" | "Lines" |
| Fourth tile | "Median age" | "Median duration" | "Median age of open holds" |
| A group | "Open holds by discipline" (by hold type, by role) | "Released holds by discipline" | "Holds by discipline" |
| Its switch | "Show as table, open holds by discipline" | "Show as table, released holds by discipline" | "Show as table, holds by discipline" |

- **The third tile:** "Single-hold lines" while the filters are the default. Once any filter is set, the status included, the command counts the holds the filters keep on each line, so a line of many holds of which the filters keep one is counted: the tile then reads "Lines with one hold", which is what it counts.
- **Words that do not change:** "Top blockers", "Top lines", and "Needs attention" are the same under every status: neither list calls the holds it counts open, and a stale hold is an open one by what it is. Under the Released status no hold is stale, and the section says so in its quiet line.
- **Loading, refetch, error:** a first load shows the section titles with skeleton rows under each, and one entry's height with a block in it under "Needs attention"; nothing can be pressed. A refetch keeps the page of before at `--opacity-stale`. A failure replaces the page with one danger notice and "Try again".

### Stat tile

A row of figures, not a row of cards.

- **Group:** one container on `--color-surface-raised` with a `--border-width-thin` border in `--color-border-default` and corner `--radius-md`. The tiles are cells of that one container, divided by vertical hairlines in `--color-border-subtle`. Cells are at least `--size-stat-tile-min-width` wide and share the row equally.
- **Tile:** padding `--space-4`. A label on top (`--text-label`, `--color-text-secondary`), a `--space-1` gap, the value (`--text-stat`, `--color-text-primary`, proportional figures), and, when a previous snapshot exists, a delta line (`--text-caption`, `--color-text-secondary`): an arrow icon, the signed change, and "since previous snapshot" in `--color-text-muted`.
- **The delta is not colored.** Whether more or fewer is good depends on the figure, so direction is shown by the arrow and the sign.
- **Interaction:** a tile whose number has a screen behind it is a button that opens that screen, under the filters that are set (on Overview: "Lines on hold" opens Lines, "Single-hold lines", or "Lines with one hold" once a filter is set, opens Lines with the Single hold preset). It says so before it is hovered: its label is in `--color-accent-text`, the ink of what can be acted on, with a chevron at `--size-icon` after it in the same ink, `--space-1` apart; the value keeps its ink. Hover fill `--color-surface-hover`. Active fill `--color-surface-pressed`. Focus: the inset focus ring. The whole tile is the target, and its name is its label and its value.
- **Static:** a tile whose number has no screen behind it yet is not a button: no focus, no hover or pressed fill, no chevron, and its label in `--color-text-secondary`. A pressable tile is static while it loads and while its figure is unavailable: there is nothing to open yet.
- **Disabled:** a figure the snapshot cannot provide shows a dash in `--color-text-disabled` and a caption naming the missing column.
- **Loading:** a skeleton block in place of the value; the label stays.
- **Error:** the group is replaced by one inline danger notice.
- **Forbidden:** a gradient, an icon per tile, a sparkline behind the number, an accent-colored value.

### Bar row

A horizontal bar per category: bars by discipline, hold type, role; top blockers and top lines.

- **Row:** height `--density-bar-row-height`, three columns: the label (`--text-body`, `--color-text-primary`, `--size-bar-label-width` wide, cut at the end with an ellipsis), the bar, and the value (`--text-table`, right-aligned, tabular figures) with an optional second value in `--color-text-muted`. A label that is an identifier, a line ID, is in `--text-mono`. A row that can be pressed and whose label is cut shows the whole label in a tooltip, at once on keyboard focus and after `--delay-tooltip` under the pointer ("Instrumentation and control / Client" among the top blockers); its accessible name always holds the whole label. A static row takes no focus and has none: its text stays whole for assistive technology.
- **Bar:** thickness `--size-bar-height`, fill `--color-chart-neutral`, corner `--radius-xs`, growing from the left edge of its column. No track behind it. Every bar in a group has the same neutral color; length carries the value. The bar is never teal and never a categorical color.
- **In a table:** Breakdown lists its groups as rows of a table, so they can expand to their lines and the list stays quick with a thousand groups. The bar then has a column of its own ("Share of holds"), between the name and the numbers, and keeps the bar's look: neutral fill, `--size-bar-height`, `--radius-xs`, no track; on the row's hover and press `--color-chart-neutral-hover`. Its length is the group's holds against the largest group the command returned, which is the whole column. It is hidden from assistive technology: the holds column says the number. A child row writes its line's disciplines in that column, and the age of its oldest hold `--space-3` after them, so the two read together in a wide window; the disciplines are cut at the end when the column is narrow, and the age never is.
- **Age bands:** the one group with a color. Its categories have an order, so each bar takes the ordinal step of its band (`--color-chart-ord-1` to `--color-chart-ord-5`) and the rows stay in band order. An ordinal bar keeps its step in every state; only the row fill changes.
- **Group:** rows are separated by space, not hairlines, and sorted by value unless the dimension has an order of its own.
- **Interaction:** the whole row is a button that filters by its category, with `aria-pressed`.
- **Wide labels:** a group whose labels are long names rather than short categories (Overview's top blockers, "Instrumentation and control / Client") gives its labels the room the bars do not need: the label column is at least `--size-bar-label-width` and grows to its longest label, while the bars keep at least `--size-bar-min-width`; only a label longer than that room is cut, and shows whole in its tooltip. The bars of such a group are shorter, and still read as shares of the largest.
- **Opening row:** a row whose category is a thing of its own, a blocker or a line, opens it on the screen that shows it in place of filtering by it (Overview's top blockers and top lines). It is a plain button: no `aria-pressed`, and never the look of a row in the active filter, because it is not on or off. Hover, active, and focus as a row that filters.
- **Static:** on a screen that cannot filter by a category, a row only shows it. It is then not a button: it takes no focus and has no hover, pressed, or selected look, so nothing on it says that it can be pressed. A row is one or the other for good: a row that can be pressed always has an action, and a static row never has one.
- **To assistive technology** a group is a named list, and each row is an item of it that reads its label and then its values. A pressable row is a button inside its item.
- **Hover:** row fill `--color-surface-hover`, bar `--color-chart-neutral-hover`.
- **Active (pressed):** row fill `--color-surface-pressed`, bar `--color-chart-neutral-hover`.
- **In the active filter:** row fill `--color-accent-subtle`, bar `--color-chart-neutral-selected`. The teal tint says the row is selected; the bar stays neutral and takes its strongest step. Hover on such a row: fill `--color-accent-subtle-hover`, bar unchanged.
- **Focus:** the inset focus ring.
- **Disabled:** not applicable.
- **Loading:** skeleton rows with bars of varied length. A refetch keeps the previous rows at `--opacity-stale`.
- **Error:** one inline danger notice in place of the group.

### Chart foundations

What every chart shares: the heatmap of the Breakdown matrix, the line chart of the Blockers curve, and the charts that come after them. The colors are fixed in "Chart palette"; this part sets the shape and the behavior.

- **Drawn by hand, over the tokens.** No chart library. The line chart is an SVG drawing. The heatmap is a grid of elements, not a drawing: its cells print their values and its labels are cut with an ellipsis and stay in view while the grid scrolls, which text in an SVG drawing cannot do. Both take every color, size, and duration from a token.
- **Where a chart sits:** directly on `--color-surface-app`, as a table does. No card, no outer border, no background of its own.
- **Size:** a chart is as wide as its container and never wider. What cannot fit, a heatmap of thirty columns in a small window, scrolls inside the chart's own region (see "Heatmap"); the page never scrolls sideways.
- **One value axis.** A chart has at most one value axis. Two measures of different scale are two charts.
- **Text:** axis labels and the legend in `--text-caption` and `--color-text-muted`, labels of rows and columns in `--text-body` or `--text-label` as each chart says, values with tabular figures. Text never wears a mark's color.
- **Interaction:** every chart answers the pointer and the keyboard alike. It is one stop in the Tab order; the arrow keys move from mark to mark inside it, and Home and End jump to the ends. What the pointer shows on hover, the keyboard shows on focus (see "Chart focus and tooltip"). A mark that leads somewhere is pressed with Enter or a click.
- **Loading:** a first load shows a skeleton in the shape of the chart, in `--color-skeleton`, without motion. A refetch keeps the previous chart at `--opacity-stale` until the new answer is there.
- **Empty:** the empty state of the screen in the place of the chart, as a table has it.
- **Error:** belongs to the screen: an inline danger notice above the chart with "Try again", and the chart of before stays under it.
- **Motion:** only the color of a cell's ring and the opacity of the tooltip change, over `--duration-fast`. Nothing in a chart moves or grows. Under reduced motion a chart has no transition at all.
- **Table view:** every chart has one (see "Chart table view").

| Token | Value | Use |
|---|---|---|
| `--size-heatmap-cell-width` | `56px` | Width of a heatmap cell: room for "10,000" in tabular figures with `--space-1` at each side. |
| `--size-heatmap-header-height` | `128px` | Height of the heatmap's column labels, which stand upright. |
| `--size-line-chart-height` | `240px` | Height of a line chart, the band of the x axis included. |
| `--size-line-chart-min-height` | `144px` | The least height of a line chart that gives way to a table under it in a short window (see "Line chart"). |
| `--size-chart-axis-width` | `56px` | Width of the value axis at the leading side of a line chart: its tick labels. |
| `--size-chart-line` | `2px` | Stroke of a line in a chart. |
| `--size-chart-marker` | `8px` | Diameter of the marker on a point of a line. |
| `--size-legend-swatch` | `12px` | Height of a legend swatch, and the side of the swatch of an empty cell. |
| `--size-legend-step` | `24px` | Width of one step of a ramp in a legend. |

### Heatmap

A count for every pair of two dimensions: the Breakdown matrix, disciplines by hold type. Up to thirty rows and thirty columns, and an "All others" row and column for the values folded into them.

- **Anatomy:** the legend above, `--density-stack-gap` over the grid. In the grid, a corner, a row of column labels, and then one row per value of the row dimension: its label and its cells.
- **Cell:** `--size-heatmap-cell-width` wide and `--density-row-height` tall, corner `--radius-xs`. Cells are `--space-0-5` apart in both directions, and the gap shows the surface: neighbors are told apart by the gap, never by an outline.
- **Color:** a cell takes the sequential step of its value, and nothing else colors it. The domain is (0, `max`], with `max` given by the command; it is cut into seven equal parts, and a value takes the step of the part it falls in, the upper bound included: a value of `max` takes step 7, one of a seventh of `max` step 1, and anything above it step 2 (`step(value, max, 7)` in `ui/src/components/charts/scale.ts`). The ramp is the one of the theme, so low values recede toward the surface in both.
- **Value:** every cell with a value prints it, `--text-table` with tabular figures, right-aligned with `--space-1` of padding: `--color-text-primary` on steps 1 to 4, `--color-chart-text-inverse` on steps 5 to 7.
- **An empty cell** (a value of 0) has no fill: it is the surface with a `--border-width-thin` hairline in `--color-border-default` inside its edge, and it prints nothing. It is not the lightest step: the lightest step means "a few", the empty square means "none", and the legend says so. Its value, 0, is in its accessible name, its tooltip, and the table view.
- **Row labels:** a column `--size-bar-label-width` wide, `--text-body` in `--color-text-primary`, cut at the end with an ellipsis, `--space-2` before the first cell. The column stays in view, on `--color-surface-app`, while the cells scroll sideways under it.
- **Column labels:** upright, read from bottom to top, in a row `--size-heatmap-header-height` tall, `--text-label` in `--color-text-secondary`, set at the bottom and cut at the end with an ellipsis. The row stays in view while the cells scroll down under it. The corner holds the name of the row dimension in the same style, at its bottom.
- **The full text** of a label that was cut is in the tooltip of every cell of its row or column, in the table view, and in the accessible name of the label, which keeps the whole text.
- **Other:** the last row and the last column when the command folded values into them, named from the catalog: "All others", so that a real value named "Other" reads apart from the fold. Their labels are in `--color-text-secondary`, and they stand `--space-1` from the rows and columns before them in place of `--space-0-5`, so the fold is seen. Their cells take the ramp like every cell and are never pressable: "All others" is not one value that a filter could take.
- **Pressable cell:** where the screen gives an action, a cell that is not in All others is pressed with Enter or a click. It says so before it is pressed, to the eye and to assistive technology: the screen writes what a press does in one line above the grid ("Press a cell to open its holds in Lines. Cells in All others combine many values and do not open."; without a fold, only the first sentence), and the tooltip of a pressable cell ends with the same action under its facts, so it is read with the cell. The tooltip of a cell in All others has no such line. A matrix that is on its way out (dimmed while the matrix of other dimensions or other filters is read) offers no press: its cells do not open, and the line is not there.
- **In Breakdown:** the matrix mode of the page. Above the heatmap, one row at the leading edge: the select of the rows, a quiet icon button that swaps rows and columns ("Swap rows and columns"), and the select of the columns; the table view toggle stands at the trailing edge of that row. A dimension chosen in one select is disabled in the other, so the two are never the same. Under that row, in `--text-caption` and `--color-text-secondary`, the line that says what a press does and, when the command folded values, how many each side folded ("12 more values of Discipline are in All others"). The heatmap takes the height that is left and scrolls inside it, so the column labels stay in view over thirty rows. A press on a cell puts its two values into the filters, in place of what those fields were filtered by, and opens the holds of Lines.
- **Hover:** a `--border-width-thin` ring in `--color-text-secondary` around the cell, over the gap, so the cell under the pointer is seen on any step. Its tooltip follows after `--delay-tooltip`.
- **Focus:** the focus ring around the cell with no offset, so it lies over the gap, on the surface, and clears 3:1 there. The focused cell is lifted above the labels that stay in view, whose fill covers the gaps beside them, so its ring is never cut. The cell's tooltip shows at once.
- **Keys:** the grid is one stop in the Tab order, on the cell the keyboard was last on (the first cell at first). The arrow keys move by one cell, into All others as into any row and column, and stop at the edges. Home and End jump to the first and the last cell of the row, `Ctrl+Home` and `Ctrl+End` to the first and the last cell of the grid. A cell that takes the focus is scrolled clear of the row labels and the column labels.
- **Scrolling:** the grid scrolls inside its own region, sideways when its columns do not fit and down when the screen gives it less height than its rows need. The page does not scroll sideways.
- **To assistive technology** it is a grid named by the screen: column headers, a row header per row, and a cell per value, whose name is its value.
- **Loading:** a first load shows skeleton blocks in the shape of the grid: six rows of eight cells and a label line for each row. A refetch keeps the previous grid at `--opacity-stale`.
- **Empty, error:** as in "Chart foundations".

### Legend

The key of the heatmap, one line above it, at the leading edge. It is not a control.

- **Anatomy, from the leading edge:** the swatch of an empty cell (a square of `--size-legend-swatch` with the hairline of an empty cell), `--space-1`, and the value 0 formatted as a cell formats it; `--space-4`; the word "Fewer", `--space-1`, the seven steps of the ramp in order, each `--size-legend-step` wide and `--size-legend-swatch` tall with corner `--radius-xs` and `--space-0-5` apart, `--space-1`, and "More, up to" the `max` of the command, formatted as a cell formats it.
- **Text:** `--text-caption` in `--color-text-muted`, tabular figures.
- **Its domain is the command's.** The upper end is the `max` the heatmap is given, never a number the interface works out.
- **To assistive technology** the swatches are pictures and are hidden; the legend reads its text.
- **States:** none. It changes with the `max` it is given and dims with its heatmap on a refetch.

### Line chart

A series of points joined by a line: the Blockers curve, lines freed against the step of the solve order. Up to about twelve thousand points (a solve order of 11,894 steps was measured).

- **Plot:** `--size-line-chart-height` tall, the band of the x axis included, and as wide as its container. The value axis is at the leading side, `--size-chart-axis-width` wide.
- **Over a table:** a line chart that stands over a table filling the same page (the curve of Blockers over its steps) gives way to the table in a short window: it is at most 35% of the height of the page's content, and never less than `--size-line-chart-min-height`, so the table keeps rows to read at 640 px. In a tall window it is `--size-line-chart-height`. The screen sets it; the chart takes the height it is given.
- **Value axis:** from 0 at the baseline to the `yMax` the chart is given at the top, never a range the interface works out. Ticks at clean values (1, 2, or 5 times a power of ten), at most five above 0, each with a hairline gridline in `--color-chart-grid` across the plot and its label right-aligned in the axis, `--text-caption` in `--color-text-muted` with tabular figures. The baseline is a hairline in `--color-chart-axis`. The name of the value (`yLabel`) stands above the axis in the same style.
- **x axis:** labels at clean values under the baseline (at most eight), in the same style; the name of the x value (`xLabel`) at the trailing end of the band. No vertical gridlines.
- **Line:** one path through every point, a stroke of `--size-chart-line` in `--color-chart-neutral` with round joins and caps, no fill under it. A single series has no legend: the screen's heading names it.
- **Markers:** none at rest, so a long line stays a line. The point under the pointer or the keyboard shows a marker of `--size-chart-marker` in `--color-chart-neutral-hover` with a ring of `--space-0-5` in `--color-surface-app`, and a vertical hairline in `--color-chart-axis` from the baseline to the top at its x. The point the screen has selected keeps a marker in `--color-chart-neutral-selected` at all times. A chart of one point shows its marker at all times.
- **Pointer:** the point nearest the pointer along x is the one shown, so the pointer never has to land on the line. A click presses that point.
- **The head of a long series:** a series whose last points add little can be drawn from its first point up to a point the screen names, so the part where it rises fills the plot; the x axis then ends at the last point drawn. The screen names that point from what its command sends and offers, beside the table view toggle, a quiet button "Show all N steps", which draws every point and then reads "Show the first K steps", K counting a selected point past the head. A point selected past the head is drawn with the points before it. Another result (another filter, another snapshot) is drawn from its head again. The table view and any table beside the chart hold every point either way. The curve of Blockers draws by default the steps up to the one after which 90 percent of the lines on hold are freed (`steps_to_most` of the solve order), and at least ten.
- **Keys:** the chart is one stop in the Tab order, on the selected point, or on the first point when none is; after the keyboard moved on it, on the point it was on, until a point is selected elsewhere (a step of the table beside it), when it is on that one. The left and right arrows move by one point, Page Up and Page Down by a tenth of the points (at least one), Home and End to the first and the last point. Enter presses the point.
- **Focus:** the focus ring around the plot, the marker and the hairline at the point, and its tooltip at once.
- **To assistive technology** it is a list box named by the screen; the point the keyboard is on is its one option, which reads the point's label and both of its values, and its place among the points. It is a list box of the page, marked `data-in-page`, so the app's shortcuts stay on around it: a list box without the mark is taken for one that opens over the page, and holds the keys while it is there. Any later list box that stands in a page carries the mark too.
- **Loading:** a skeleton block as large as the plot. A refetch keeps the previous chart at `--opacity-stale`.
- **Empty, error:** as in "Chart foundations".
- **A forecast** (a band and a dashed projection) is not drawn by this chart yet.

### Chart focus and tooltip

The chart tooltip is the tooltip of "Tooltip", with rows. It names the mark the pointer or the keyboard is on and gives its exact value.

- **Shape:** that of a tooltip: fill `--color-surface-overlay`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-sm`, `--shadow-overlay`, padding `--space-1` above and below and `--space-2` at the sides, at most `--size-tooltip-max-width` wide, at `--z-tooltip`.
- **Rows:** one per fact, `--space-2` between label and value: the label in `--text-caption` and `--color-text-secondary`, then the value in `--text-label` and `--color-text-primary` with tabular figures. The value row of a mark leads with its key: a swatch of `--size-legend-swatch` in the cell's step for a heatmap, a short line of `--size-chart-line` in the line's color for a line chart. Labels that were cut on the chart are written in full and wrap.
- **What it shows:** for a heatmap cell, the row value, the column value, and the count; for a point, its label, its x, and its y. Where a press on the mark does something, a last line across both columns says what, in `--text-caption` and `--color-text-secondary`, `--space-1` under the facts.
- **Placement:** `--space-1` under the mark, above it where there is no room below, kept inside the window. It does not cover the mark, except in a window too short for it either below or above: it then stands at the top of the window. Whether the mark is in view is judged against the window, so a heatmap cell scrolled under the pinned labels keeps its tooltip until the focus or the pointer moves.
- **Showing:** on keyboard focus, at once. Under the pointer, after `--delay-tooltip`; once it shows, it follows the pointer from mark to mark without waiting again, until the pointer leaves the chart. It fades in over `--duration-fast`, and without a transition under reduced motion.
- **Dismissing:** when the pointer leaves the chart and the focus is not in it, when the focus leaves the chart, and on Esc, which hides it until the next move. An Esc that hides a tooltip the pointer opened, with the focus elsewhere, does nothing else: a detail panel stays open, and the next Esc closes it. With the focus on the chart, Esc is the chart's: it hides the tooltip, and what else it does there the screen says (the curve of Blockers closes the panel it opened). It takes no pointer: it follows the pointer, so it could not be reached anyway, and it holds nothing that is not in the table view.
- **States:** none of its own.

### Chart table view

The same numbers as a table, for reading exact values, for assistive technology, and for a printed page. Every chart has one.

- **The toggle:** a quiet toggle button "Table view" with a table icon, placed by the screen in the row above its chart. Pressed, it has fill `--color-accent-subtle` and text `--color-text-primary`, as a marked preset; hover `--color-surface-hover`, or `--color-accent-subtle-hover` while pressed; active `--color-surface-pressed`; the focus ring. It has `aria-pressed`. Pressing it shows the table in the place of the chart, and pressing it again the chart; the focus stays on the toggle.
- **The table:** a read-only table (see "Table") at most twelve rows tall, then it scrolls. Every column sorts, by the values its cells format; the rows start in the order of the chart. A screen whose chart stands over a table of its own keeps the table view to about the height of the chart, so that its own table keeps its room: Blockers keeps the table view of its curve to six rows. Values are formatted as the chart formats them, so every number of the chart is in it, and only those.
- **Heatmap:** the first column holds the row values under the name of the row dimension and stays in view; then one column per column value, named by its full text, and All others last. The folded row and column are written in `--color-text-secondary`, as the heatmap writes their labels. An empty cell reads 0.
- **Long headers:** a column of a table view makes room for at most 24 characters of its header, so thirty long remarks do not make a table many screens wide. A longer header is cut at the end with an ellipsis. Its accessible name keeps the whole text, and the whole text shows in a tooltip of the chart's shape (one row, "Column" and the text) at once when the header has the keyboard's focus and after `--delay-tooltip` under the pointer; it goes when the focus or the pointer moves to anything else, and on Esc. The same text is the column's label in the chart, and in the tooltip of each of its cells.
- **Line chart:** one row per point, in the order of the points until a header is pressed (the x value sorts from the first): the x value, the label, and the y value, each column named as the chart names its axes.
- **States:** those of the chart it stands for: skeleton rows on a first load, dimmed rows on a refetch.

### Files: Excel

A workbook is drawn in the light theme, with the hex values of `crates/export/palette.json`. Its text keeps Excel's automatic font color, black, and the writer sets no font color. Every fill under text gives black at least 4.5:1; a test computes the contrast of black against every fill the writer uses. Colors are conditional formats, so they follow a reader's own sorting.

- **Ages** (the days of open holds, a line's oldest age): one cell rule per default age band of the engine (0 to 13, 14 to 29, 30 to 59, 60 to 89, 90 and more days), read from the engine's bands, not copied. Fills: none, then `--color-chart-seq-1`, `--color-chart-seq-2`, `--color-chart-seq-3`, `--color-chart-seq-4` (17.1, 12.5, 8.8, and 6.2 to 1 under black). The color says the band, whatever the other ages of the file. The ordinal ramp is not used: its steps are marks, not backgrounds of text.
- **Hold counts:** a solid data bar of `--color-chart-neutral` (4.8 to 1 under black).
- **Cross-tabs:** a two-color scale from `--color-chart-seq-1` to `--color-chart-seq-4` over the cells between the labels and the totals; every fill between them is at least as light as `--color-chart-seq-4`.

### Files: Chart images

A chart saved as an image (SVG, or PNG at twice its size) or copied as pixels is drawn by `hx-export` in the light theme only, with the hex values of `crates/export/palette.json`, whatever the theme of the app. It looks as the chart on the screen does: the same marks, ramps, and type, without the states of a pointer or a keyboard.

- **Size:** 960 px wide (wider only for a heatmap whose values need it, see below); as tall as its content. A PNG is twice the size, every pixel opaque.
- **Margins:** `--space-6` (24 px) on every side, on `--color-surface-app`, which fills the whole image.
- **Header:** the title from the catalog, `--text-section-title` (17/24, semibold, `--color-text-primary`), wrapped where long; `--space-1` under it, the filters the chart was drawn under, one per line in `--text-caption` and `--color-text-muted`, or the catalog's "No filters"; `--space-6` before the chart.
- **Typography:** the embedded static faces of `crates/export/fonts/` (Public Sans 400 and 600, Reddit Mono 400). No font of the machine is read, so an image is the same on every machine. Every size is 13 px except the title and the values of a heatmap, which take a size from 13 px down to 9 px where a cell needs it (see Heatmap). A label is measured in the face and cut at the end with an ellipsis where it would not fit. A saved SVG file has its text converted to the outlines of the embedded faces, so that it looks the same on a machine without them (its text cannot be selected), and carries the chart's title as its `<title>` for a reader of the file; the PNG, the copied image, and the report's charts draw the same drawing.
- **Bars** (a dimension, or the top blockers): a header row names the labels (the dimension, `--color-text-muted`) and the values ("Holds", at the trailing edge). Rows as "Bar row": `--density-bar-row-height` (32 px), the label in `--text-body`, a bar of `--size-bar-height` in `--color-chart-neutral` with `--radius-xs`, the count right-aligned. The label column is `--size-bar-label-width` wide and grows to its longest label while the bars keep `--size-bar-min-width`. A dimension draws its 30 largest values and folds the rest into "All others", last, `--space-1` apart, its label in `--color-text-secondary`. The top blockers are ten, with no fold.
- **Heatmap:** the legend first, then the name of the columns, the column labels upright in a header of `--size-heatmap-header-height`, the name of the rows in the corner, and a row per value, as "Heatmap": 30 by 30 at most and an "All others" row and column. A cell is `--density-row-height` (36 px) tall and at most `--size-heatmap-cell-width` wide, narrower when the columns need it to fit the 960 px. Every cell with a value prints it, in the ink that reads at 4.5:1 or more on its step (computed from the colors, and tested: primary on steps 1 to 4, inverse on 5 to 7): at 13 px where the widest value of the matrix fits a cell; else, for every cell alike, at the size that fits it, in half pixels, down to 9 px; and where 9 px does not fit either, the cells are made as wide as the widest value at 9 px and the image is wider than 960 px. An empty cell is the surface with a hairline in `--color-border-default`.
- **Curve:** as "Line chart": the name of the value over the axis, a plot `--size-line-chart-height` tall with gridlines in `--color-chart-grid` at clean ticks (whole counts only), the baseline in `--color-chart-axis`, a 2 px line in `--color-chart-neutral`, the last value at its end in `--color-text-secondary`, and the name of the step under the axis. It draws the first steps the request names (the head on the screen), or every step for 0 or more than there are. The step after which 90 percent of the lines on hold are freed, when it is drawn, has a hairline in `--color-chart-axis`, a marker of `--size-chart-marker` in `--color-chart-neutral-selected` with a ring of the surface, and a line under the chart that says it next to the same marker.
- **Empty:** a chart with nothing to draw has its header and the catalog's "No holds" in `--color-text-muted`, and no mark.
- **Words** come from the catalog (`file.chart.*`). A value placed in a sentence is written `{name}` with single braces in the catalog, which the interface leaves as it is and `hx-export` fills; counts are written with their thousands separated by commas.

### Files: Status report

The status report is a PDF of the holds the filters keep, made by `hx-export` in the light theme only, with the hex values of `crates/export/palette.json` and the embedded faces of `crates/export/fonts/`, the same on every machine. Each page is composed as an SVG and drawn into the PDF with its text kept as text (selectable, the three faces embedded as subsets).

- **Page:** A4 portrait, 595.28 by 841.89 points, margins of 40 points on every side, on `--color-surface-app`. A page is drawn at 100 pixels to the inch (0.72 points to a pixel), so every size of the interface in pixels is its size here: 13 px text is 9.36 points.
- **Grid:** one column the width inside the margins. Parts follow one another down the page, `--space-6` apart. A part that does not fit the room left starts the next page; a part is never split, except a table, which continues on the next page under its header row drawn again. A section title is kept with what follows it (a table's title with its header row and first row).
- **Footer:** on every page, under the content and `--space-4` apart from it: the app version ("Hold Explorer 0.1.0") at the leading edge and "Page N of M" at the trailing edge, `--text-caption` in `--color-text-muted`.
- **Type:** the report's title in `--font-size-lg` on `--line-height-lg`, semibold, `--color-text-primary`; section titles as "Section title", level 2 (17/24, semibold), `--density-stack-gap` (compact, 8 px) above what follows; body, labels, tables, and captions at 13 px on 16 px lines; tile values at `--font-size-xl` on `--line-height-xl`, semibold. Line IDs in the monospace face.
- **Header (page 1):** the title from the catalog, then a fact list as "Fact list": a hairline in `--color-border-subtle` above the first row and under each, rows at least 28 px tall, the label column `--size-bar-label-width` in `--color-text-secondary`, the value in `--color-text-primary`. The facts: the workspace, the snapshot date, when the report was made (date and local time, as the About sheet writes it), and the filters, one row each with the label beside the first, or the catalog's "No filters" in `--color-text-muted`. A value is wrapped over at most four lines, the last ending with an ellipsis when it is cut; the rows flow onto the next page when the filters fill the first.
- **Tiles (page 1):** as "Stat tile", static and without deltas (one snapshot is in view): one group with a hairline border in `--color-border-default` and corner `--radius-md`, cells divided by hairlines in `--color-border-subtle`, padding `--space-4`, the label (wrapped where long) in `--color-text-secondary`, `--space-1` above the value. Four figures as the Overview names them under the status filter: holds, lines, lines with one hold (single-hold lines with no filter set), and the median age, with "d" after its days, or the catalog's "Not known" in `--color-text-muted` when no open hold has a creation date. Under them, `--space-3` apart, one line in `--color-text-secondary`: how many holds have been open for 90 days or more, or that it is not known for want of creation dates. The tiles and that line are one part, never split over two pages.
- **Bars:** holds by discipline (page 1), by hold type, and by role, and the top ten blockers, each under its section title, drawn as "Files: Chart images" draws bars, in the box of the page. A dimension draws its 15 largest values and folds the rest into "All others", so that the disciplines always fit on page 1 under the header and the tiles.
- **Solve order:** the steps after which 90 percent of the lines on hold are freed, at most 20, as a table: step, blocker (wrapped), holds, lines freed by the step, lines freed so far. Under it a count line ("Steps shown: 20 of 205"), then the curve of every step with the 90 percent step marked, as "Files: Chart images" draws it, under its own title.
- **Oldest open holds:** the 20 open holds with the greatest age, oldest first, as a table: line ID, discipline and hold type (each as wide as its widest value, up to 160 and 220 px, wrapped where wider), the remark wrapped over at most four lines (the last ending with an ellipsis when it is cut), and the age in days. A count line under it ("Holds shown: 20 of 322 open holds").
- **Tables:** as "Table" at the compact density, without a fill or a container: a header row 28 px tall in `--color-text-secondary` with a hairline in `--color-border-default` under it, rows at least 28 px tall with a hairline in `--color-border-subtle` under each, 8 px of padding at each side of a cell, numbers at the trailing edge. A column of numbers is as wide as its widest value or its header; the column of running text takes the rest. A column of running text, or one sized to its values, wraps a text that does not fit over at most four lines, the last ending with an ellipsis when it is cut; any other text column cuts it with an ellipsis.
- **No open holds:** when the status filter keeps released holds only, the parts that need open holds (the median age tile and the stale holds, the solve order, and the oldest open holds) are not drawn: each says, in one line of the catalog in `--color-text-muted`, that the filters keep released holds only. The solve order and the oldest open holds are then one part, their two titles and lines kept together, so a line never takes a page alone. A part with nothing to draw says the catalog's "No holds".
- **Not in M1:** deltas, the trend, and the changes since the previous snapshot. One snapshot is in view and there is no history, so they are not drawn, not even empty.
- **Document:** the title is the catalog's; the creation date is the moment the report was made, in the local time the header states with its offset from UTC (`D:20261019140500+03'00`, and `+03:00` in the XMP). Nothing else of the moment or the machine is written: no producer, and identifiers derived from the content, so the same input gives the same bytes on every machine (a test checks a SHA-256 on Linux and Windows).
- **Words** come from the catalog (`file.report.*`, and the keys the charts, the About sheet, and the Summary already use), with values in single braces filled by `hx-export`.

### Notice (inline)

A message that belongs to a place on the page and stays until it no longer applies.

- **Anatomy:** a leading icon at `--size-icon` in the tone's text color, then an optional title (`--text-body-strong`), the message (`--text-body`), and optional actions (quiet buttons or links). An optional close button sits at the trailing edge.
- **Shape:** padding `--space-3`, corner `--radius-md`, a full `--border-width-thin` border. Never a thicker stripe on one side.
- **Info:** fill `--color-info-subtle`, border `--color-info-border`, icon `--color-info-text`.
- **Success:** fill `--color-success-subtle`, border `--color-success-border`, icon `--color-success-text`.
- **Warning:** fill `--color-warning-subtle`, border `--color-warning-border`, icon `--color-warning-text`.
- **Danger:** fill `--color-danger-subtle`, border `--color-danger-border`, icon `--color-danger-text`.
- **Text:** title and message are `--color-text-primary` in every tone; supporting detail is `--color-text-secondary`. The tone is carried by the icon, the tint, and the words.
- **States:** the notice itself is not interactive. Its buttons and links have their own states and the focus ring. Danger notices are announced at once (`role="alert"`); the others politely (`role="status"`).

### Shell notice

What the shell has to say about the app as a whole, or about something that started on a page the user has left. It is the inline notice, unchanged, in a fixed place.

- **Place:** at the top of the content area, directly under the top bar and above the page, as wide as the page's content: `--space-3` below the top bar, with the page padding `--layout-page-padding-x` at its sides. It is not part of the page and does not scroll with it. The page starts under it.
- **Several at once:** one under the other, `--space-2` apart, in a fixed order: what failed, what the shell has to report, why a file cannot be dropped on the window, a warning about the workspace, and last the notice that an older snapshot is in view.
- **Tones:** danger for an action that failed (announced at once), warning for something the user should know before going on, info for a standing fact.
- **The warning about the workspace** is titled by what it is about: "This workspace will not be reopened at the next start" when the settings could not be saved (also when the saved views could not be read beside it, which its message says as well), and "The saved views of this workspace could not be read" when only they could not. Success is never a shell notice: a confirmation is a toast.
- **Staying:** it stays across pages. Opening another destination does not remove it, because the user may not have read it yet and the page it is about may be gone.
- **Leaving:** each has a close button and goes when that is pressed. The notice that an older snapshot is in view has none: it is a state, not a message, and goes when the newest snapshot is selected, which its one action, a quiet button, does.
- **What belongs here** is set by "Where an error goes": what outlives the page it started on. A failure the page can still show stays on the page, beside what failed.
- **States:** those of the inline notice. Its buttons have their own states; the action of a shell notice follows the pending rule of every button.

### Toast

A short confirmation that floats, then leaves. The home of Undo.

- **Position:** the bottom left of the content area, `--space-6` from its edges, at `--z-toast`. At most three are stacked, newest at the bottom, `--space-2` apart.
- **A fourth toast** pushes out the oldest toast that offers no Undo and says of no failure. A toast that carries Undo is never pushed out: it leaves when its time is up, when it is closed, or when its action is taken. When every toast on screen carries one, nothing is pushed out and the stack is taller than three for the seconds that takes; an undo that disappears early cannot be had back, and a stack of four can. A toast that says something failed is never pushed out by a toast of another kind either, and has no time: it stays until it is closed, and a third failure takes the place of the oldest of the two that show (see "Error" below).
- **Shape:** fill `--color-surface-overlay`, `--border-width-thin` border in `--color-border-default`, corner `--radius-lg`, `--shadow-overlay`, padding `--space-3`, between `--size-toast-min-width` and `--size-toast-max-width` wide.
- **Anatomy:** an optional state icon, the message (`--text-body`, `--color-text-primary`) saying what was done, an action, an optional second action after it, and a close button. Each action is a quiet button whose label is `--color-accent-text`, for example "Undo", or "Open file" and "Show in folder" after a file is saved. Hover fill `--color-surface-overlay-hover`. Either action, pressed, closes the toast.
- **Undo:** a destructive action is carried out at once and its toast offers "Undo". `Ctrl+Z` triggers the Undo of the newest toast: its first action, when that is an undo. It never triggers a second action, nor an action that is no undo ("Open file"). There is no confirmation prompt.
- **Timing:** stays for `--timeout-toast`; the timer pauses while the toast is hovered or holds focus. It enters by fading in and rising `--space-2` over `--duration-base` and leaves by fading over `--duration-fast`.
- **Focus:** a toast never takes focus when it appears. It is announced politely, and its buttons are reachable by Tab and show the focus ring. Toasts are reached in the order they appeared, oldest first, after the page.
- **When a toast that holds the focus goes**, the focus is not dropped. It moves to the toast that came after it, or, when that was the last one, to the toast before it. The toast itself takes it, and shows the focus ring, not one of its buttons: a second press of the same key must not trigger the Undo of another toast. When no toast is left, the focus goes back to where it was before it entered the toasts.
- **Error:** a failure that needs reading is an inline notice, not a toast. A failure of an action that has no place of its own on the page, such as an Undo that could not be done, is a toast in the danger tone: the `OctagonAlert` icon in `--color-danger-text`, its message in the words of the command. It has no timer: it stays until it is closed, and no toast of another kind pushes it out. At most two failures show at once: a third takes the place of the oldest.

### Tooltip

A short label that names or explains the control it points to. It floats, it is never interactive, and it is never the only source of what it says.

- **Use:** the name of an icon-only button, the shortcut of a control, the full text of a label or a cell that was cut with an ellipsis, the exact value of a chart mark.
- **Never the only place:** a tooltip repeats or names. It never holds information that is available nowhere else. Its text is also the control's accessible name or description, a truncated text is shown in full in the detail panel, a chart value is in the table view, and anything the user must know in order to act (why a control is disabled, what is wrong with a field) is in text on the page.
- **Shape:** fill `--color-surface-overlay`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-sm`, `--shadow-overlay`, padding `--space-1` above and below and `--space-2` at the sides, at most `--size-tooltip-max-width` wide, at `--z-tooltip`. Longer text wraps. No title, no button, no link, and no arrow.
- **Text:** `--text-caption` in `--color-text-primary`. A shortcut follows the label after a `--space-2` gap, in `--text-mono` and `--color-text-muted`. A chart tooltip is the same component with one row per series: a swatch in the mark's color, the label in `--color-text-secondary`, and the value in `--color-text-primary` with tabular figures.
- **Placement:** `--space-1` from the control, under it by default, moved to another side where it would leave the window. It never covers the control it describes.
- **Showing:** on hover, after the pointer has rested on the control for `--delay-tooltip`. On keyboard focus, at once. It fades in over `--duration-fast`; nothing moves.
- **Dismissing:** it goes when the pointer has left both the control and the tooltip, when focus leaves the control, when the control is pressed, and on Esc. Esc closes only the tooltip: it does not move focus and closes nothing else. It stays while the pointer is on the tooltip itself, so its text can be read without hurry, and it has no timeout.
- **States:** none of its own. It takes no focus, and it has no hover, active, disabled, loading, or error state.
- **Reduced motion:** the fade keeps `--duration-fast`, as every opacity change does.

### Skeleton

- **Shape:** blocks in `--color-skeleton` with corner `--radius-xs`, laid out like the content they stand for: text lines `--space-3` thick inside their line box, a block for a stat value, rows at the current density.
- **Motion:** none. A skeleton does not shimmer or pulse. When content arrives it replaces the skeleton with a fade over `--duration-fast`.
- **Use:** a first load only. A refetch never shows skeletons; it keeps the previous render at `--opacity-stale`.

### Empty state

An empty state teaches the next action. It is never "Nothing here".

- **Anatomy:** a title (`--text-section-title`, `--color-text-primary`) that says what is absent, one or two sentences (`--text-body`, `--color-text-secondary`, at most `--layout-prose-max-width` wide) that say why and what to do, and one action button. No illustration and no icon.
- **Placement:** left-aligned in the normal layout, where the content would be, `--space-12` below the page header on an otherwise empty page and `--space-6` inside a table area.
- **Action:** a secondary button, or a primary button when it is the main action of the screen (for example "Import" in a workspace without snapshots).
- **Filtered to nothing:** when filters hide every row, the title says so and the action is "Clear all". When the default filters keep nothing, because no hold of the snapshot is open, the action is "Show all holds", which sets the status to all holds.

### Coming soon screen

A destination that is not built yet opens a screen made of the page header and the empty state, both unchanged, inside the normal shell. It is a complete page, not a placeholder.

- **Page header:** the destination's name as the page title (`--text-page-title`), for example "Blockers". No description line and no page actions, and no breadcrumb, as for every destination.
- **Empty state title:** shown, as in every empty state (`--text-section-title`, `--color-text-primary`). It says what is absent: "Not available in this version". The page title names the destination and this title states its status. They are two different statements, so the screen has both.
- **Empty state body:** one or two sentences on what the destination will show, in the empty state's own style (`--text-body`, `--color-text-secondary`, at most `--layout-prose-max-width` wide). The body is secondary ink here as in every empty state. The one statement the user must not miss, that the destination is not available, is therefore the title and not a line of body text.
- **Action:** one secondary button, "Go to Overview".
- **Placement:** that of an empty state on an otherwise empty page, `--space-12` below the page header.
- **Forbidden:** an illustration, a progress bar, a date, a version number, an apology, a sign-up, and the accent color.

### Page header

- **Anatomy:** on a page below a destination, a breadcrumb as the first line (see "Breadcrumb"); then the page title (`--text-page-title`, `--color-text-primary`) on the left, with an optional one-line description under it (`--text-body`, `--color-text-secondary`); page actions as buttons on the right, level with the title. Tabs, a view switch, or the filter bar, when the page has them, sit directly under the header; a view switch stands above the filter bar, and its hairline and the upper hairline of the bar are one line.
- **Spacing:** the header starts at the content padding (`--layout-page-padding-x`, `--layout-page-padding-y`) and is followed by a `--space-4` gap. A `--space-2` gap separates the breadcrumb from the title. The header has no border and no background of its own.
- **Rules:** one page title per page, and it names the destination or the step ("Lines", "Review import"). No icon beside it. A destination has no breadcrumb above its title; a page below a destination has one.
- **Loading:** the title and the breadcrumb are known before the data is and never show a skeleton.
- **Notice of an action:** what an action of the page started and failed (an export) is a danger notice directly under the header, before the view switch and the bar, followed by a `--space-4` gap.

### Breadcrumb

The way back up from a page that lies below a destination. It is part of the page header and sits above the page title.

- **When:** only on a page below one of the nine destinations. The pages of the import flow are such pages: "Import", then "Map columns"; "Import", then "Review". A destination itself (Overview, Breakdown, Lines, Blockers, History, People, Follow-up, Rules, Settings) has no ancestor and shows no breadcrumb, because a trail of one item would only repeat the title. The workspace is not part of the trail: the top bar already names it. The one trail outside a page header is that of a hold in the detail panel, which leads back to the hold's line (see "Detail panel").
- **Anatomy:** a navigation landmark named "Breadcrumb" that holds an ordered list. First the ancestors, from the destination down, each a link to its page. Last the current page, with the page title as its label: it is text, not a link, and it is marked as the current page for assistive technology (`aria-current="page"`). Between two items sits a separator, a chevron icon at `--size-icon` in `--color-text-muted`. The separator is decoration and is hidden from assistive technology.
- **Shape:** one line in `--text-label`. Each item has `--space-1` of padding at the sides and `--space-0-5` above and below, and corner `--radius-sm`. Items and separators are `--space-1` apart, so the focus ring of a link does not reach the separator. The trail is pulled out to the left by `--space-1`, so the text of its first item starts on the left edge of the page title.
- **Ancestor:** a link. Text `--color-accent-text`, underlined at rest with a `--border-width-thin` line `--space-0-5` under the text, so a link is never told by its color alone.
- **Hover:** fill `--color-surface-hover`. The ink and the underline stay.
- **Active (pressed):** fill `--color-surface-pressed`.
- **Focus:** the focus ring.
- **Current page:** text `--color-text-secondary`, no underline, no fill, and no hover, active, or focus state, because it cannot be acted on. It is quieter than the links on purpose: the page title directly under it already says where the user is.
- **Disabled, loading, and error:** none. A trail names pages, and a page that can be named can be opened.
- **Narrow window:** the trail stays on one line and never wraps. When it does not fit, the ancestors give way first: each is cut at the end with an ellipsis, all of them together, and no item is removed from the trail. An ancestor is never narrower than `--space-6`, which is room for the ellipsis. An ancestor that is cut shows its full label in a tooltip, and its accessible name is always the full label. The current page is never dropped. It keeps its full label as long as any ancestor can still give way, and is cut at the end with an ellipsis only when the ancestors, each at its least width, still leave it too little of the line.
- **Transitions:** the fill over `--duration-fast` with `--ease-out`.

### Section title

The heading of a part of a page or of a panel.

- **Level 2:** `--text-section-title` in `--color-text-primary`. The sections of a page ("Snapshot date", "Workspace") and the title of the detail panel.
- **Level 3:** `--text-body-strong` in `--color-text-primary`. A part inside a section, and the parts of the detail panel ("Blockers to clear", "Open holds"). It is told from body text by its weight and its ink, not by a size between two steps.
- **The level is the heading level** that assistive technology reads. Levels follow the page title, which is level 1, without skipping one.
- **Shape:** one line of text and nothing else: no icon, no rule under it, no accent color, no count in another ink. Sentence case. It has no margin of its own; what follows it in its section starts `--density-stack-gap` under it, and sections are `--space-6` apart on a dense page and `--space-8` apart on Overview.
- **States:** none. A section title is not interactive and takes no focus. A title that opens something is a disclosure row.

### Fact list

Pairs of a label and a value, ruled like the rows of a register: the facts of a file on the import review, the mapping in use, the facts of a line or a hold in the detail panel.

- **Container:** none. The list sits on its surface with a hairline in `--color-border-subtle` above its first row. No outer border, no fill, no zebra stripes.
- **Row:** at least `--density-row-height` tall, `--space-0-5` of padding above and below, a bottom hairline in `--color-border-subtle`, and `--space-3` between its parts. The parts of a row stand on one baseline. A row of one line is therefore centered in its height, and in a row that has grown the label stays beside the first line of its value. A value of several lines keeps the room above and below it that a single line has in a row, so it never runs up to the hairlines.
- **Label:** a column `--size-bar-label-width` wide, in `--text-label` and `--color-text-secondary`, so the values of a list start on one line.
- **Value:** `--text-body` in `--color-text-primary`, taking the rest of the row. A value is never cut: a fact list is where the full text is read, so a long value wraps and the row grows.
- **Identifier:** a line ID, a tag, a source ID, or a file name is in `--text-mono` and can be selected and copied as the exact source text. A line ID fits on one line in every place the list is used. A file name can have any length, so it breaks where the row ends instead of being cut.
- **Absent value:** words in `--color-text-muted` that say what is absent ("No project number in the file"). Never an empty cell and never a dash alone.
- **Action:** a row may end with one quiet button that acts on its fact ("Choose another sheet"), at the trailing edge.
- **Loading:** on a first load the labels show, because they are known before the values are, and each value is a skeleton line. A re-read dims the page or the panel that holds the list, not the list by itself.
- **Other states:** none. The list is not interactive: it has no hover, focus, active, or disabled state. A row that leads somewhere does so through its action button. An error belongs to the section that holds the list.
- **To assistive technology** it is a named list, and each row reads its label and then its value.

### Disclosure row

A row that opens in place: its title and what it counts are on the page at once, and the detail is one press away, on the same page. The skipped rows and the warnings of the import review, and the groups of holds in the detail panel.

- **Row:** the whole first line is one button: at least `--density-row-height` tall, padding `--space-1` at the leading side and `--space-2` at the trailing side, corner `--radius-sm`. It holds a chevron at `--size-icon` in `--color-text-secondary`, a `--space-2` gap, and the title in `--text-label` and `--color-text-primary`. A count may follow at the trailing edge, in `--text-table` and `--color-text-secondary` with tabular figures ("37 times"). Title and count together are the name of the button. The title may be a heading, at the level its place on the page asks for.
- **Summary:** an optional sentence under the title that is always shown, open or closed: what the row means or what the app did. `--text-body` in `--color-text-secondary`, at most `--layout-prose-max-width` wide, starting where the title starts, past the chevron, with `--space-2` under it.
- **Action:** a row may carry one quiet button at the trailing edge of its first line. It is outside the button that opens the row, and has its own place in the Tab order.
- **Detail:** starts where the title starts, with `--space-2` between its parts and `--space-3` under it. It appears at once: nothing is resized over time. It is not on the page while the row is closed, so a closed row costs nothing however much it holds.
- **Closed:** the chevron points to the trailing side; `aria-expanded="false"`.
- **Open:** the chevron points down; `aria-expanded="true"`. The row keeps its fill; what shows that it is open is the chevron and the detail.
- **Hover:** fill `--color-surface-hover` on the button.
- **Active (pressed):** fill `--color-surface-pressed`.
- **Focus:** the inset focus ring on the button, because the row runs to the edge of its column. Enter or Space opens and closes it.
- **Group:** rows follow each other like the rows of a fact list: each has a bottom hairline in `--color-border-subtle`, and the group has the same hairline above its first row.
- **Disabled:** never. Where there is nothing to open, the row is replaced by a statement in its place: one line of `--text-body` in `--color-text-secondary`, as tall as a row, starting where the titles start ("No rows were skipped"). A row that cannot be opened and does not say why would be a dead control.
- **Loading and error:** belong to the detail. A detail that is read when the row opens shows its own skeleton, and its failure is an inline notice inside the detail.
- **Transitions:** the fill over `--duration-fast` with `--ease-out`.

### Detail panel

The full record of one line, one hold, or one blocker, beside the list it was chosen from: a region at the right of the shell that leaves the list visible and usable. A data destination opens it for what its address selects (`?line=<id>`, `?hold=<position>`, or `?blocker=<key>`), and closing it takes the selection out of the address. One is selected at a time: selecting a line, a hold, or a blocker, from a table or from inside the panel, replaces the one before, and the destination stays the one on screen.

- **Region:** `--layout-detail-width` wide and as tall as the content area, fill `--color-surface-panel`, a `--border-width-thin` hairline in `--color-border-default` on its leading edge. It scrolls on its own; its head does not scroll. It is a complementary landmark named by its heading.
- **Beside or over:** from `--layout-breakpoint-wide` up it is a column of the shell, and the content area narrows by its width. Below that it lies over the right edge of the content area at `--z-panel`, with `--shadow-overlay`, and the content keeps its width under it. There is no scrim either way: the rows to its left can still be read, pressed, and reached by keyboard.
- **Head:** padding `--space-4` at the sides and above, `--space-3` below, and a hairline in `--color-border-subtle` under it. A hold has its breadcrumb as the first line, `--space-2` above the title row. The title row holds the heading at the leading edge and the close button at the trailing edge, an icon button named "Close panel". The heading is a section title of level 2. For a line it is the line ID, in `--font-family-mono` at the size of `--text-section-title`, never cut; for a hold it is "Hold"; for a blocker it is its label ("Piping / 577-PK-400") in the body face at the size of `--text-section-title`, wrapped and never cut (see the Identifier Rule), and "Blocker" until the label is known or when the snapshot in view has no such blocker. A blocker has its type as a neutral tag on a second row under the title, `--space-2` below it. A line has a second row under the title, `--space-2` below it: the quiet button "Copy line ID" with its icon, and beside it the status of the copy in `--text-caption` and `--color-text-secondary` ("Line ID copied"), announced politely. A copy the system refuses is an inline danger notice under that row, which says why and that the line ID in the title can be selected and copied with `Ctrl+C`.
- **Body:** padding `--space-4`. Sections are `--space-6` apart; each starts with a section title of level 3, and its content stands `--density-stack-gap` under it.
- **A line:** a fact list first, with no title: model size, LDT size, and stress calc; when the two sizes differ, the LDT size is followed by a warning tag "Size mismatch". Then "Blockers to clear", then "Open holds", then "Released holds" as a disclosure row of level 3 that counts them and is closed when the panel opens.
- **Blocker row:** in an ordered list, in the order the command gives, ruled like a fact list: a hairline above the first row and one under each. Each row is one button as wide as the body that opens that blocker in the panel, with the anatomy and the states of a hold row (padding `--space-2`, corner `--radius-sm`, `--space-1` between its lines, hover, active, the inset focus ring). The first line is the blocker's label in `--text-body` and `--color-text-primary`. The second holds the blocker type as a neutral tag, its place in the solve order ("Step 3", or "Not ranked") in `--text-caption` and `--color-text-secondary`, and at the trailing edge how many lines it blocks ("Blocks 12 lines"), in the same ink with tabular figures. A line without open holds has no blocker, and the section says so in one line of `--text-body` and `--color-text-secondary`.
- **Hold row:** one button as wide as the body, ruled as the blocker rows are: padding `--space-2`, corner `--radius-sm`, and `--space-1` between its lines. The first line is the discipline and the hold type in `--text-label` and `--color-text-primary`, with the age of an open hold, or the duration of a released one, at the trailing edge ("Age 41 d") in `--text-caption` and `--color-text-secondary` with tabular figures. The second is the full remark in `--text-body` and `--color-text-primary`, wrapped and never cut. The third is who raised it and when, in `--text-caption` and `--color-text-secondary`. Hover fill `--color-surface-hover`, active fill `--color-surface-pressed`, the inset focus ring. A press opens that hold in the panel. A section without holds says so in one line, as the blockers do.
- **A hold:** the breadcrumb leads back to its line: the line ID is the ancestor, a link that opens the line in the panel, and "Hold" is the current item. Then "Remark", the full remark as running text at most `--layout-prose-max-width` wide. Then "Facts", a fact list: line, discipline, hold type, name, role, created, and the age of an open hold or, for a released one, the release date, the duration, and the release remark; then the blocker and the blocker type, and the source ID when the hold has one. Line ID and source ID are identifiers; the blocker is written in the body face, as everywhere. Then "Other columns", a fact list of every column of the export the mapping did not recognize that has a value on this hold, by its header; the section is left out when none has.
- **A blocker:** what clearing it would do, under the filters of the bar. A fact list first, with no title: discipline; holds, the holds that wait for it; "Frees on its own" and "Also held by others", each a count of lines; and "Solve order", its step in the solve order of the same holds ("Step 3"), or "Not ranked" in the muted ink of an absent value. Then four sections. "Frees on its own": the lines no other blocker holds, which clearing it frees. "Also held by others": its lines that another blocker holds as well. Each lists its lines as line rows, in the order the command gives. "Linked blockers": the other blockers on its lines, most shared lines first, as blocker rows whose second line holds the type tag and, at the trailing edge, the lines both share ("Shares 4 lines"); a press opens that blocker. "Oldest hold": its oldest open hold, as a hold row whose first line is the line ID in `--text-mono`; a press opens the hold. A section with nothing to list says so in one line, as the sections of a line do.
- **Line row:** one button as wide as the body, at least `--density-row-height` tall, padding `--space-2` at the sides, corner `--radius-sm`, ruled as the blocker rows are, holding the line ID in `--text-mono` and `--color-text-primary`, on one line and never cut. Hover, active, and focus as a hold row. A press opens that line in the panel.
- **Long lists:** a blocker can free or share hundreds of lines. Each list of lines, and the linked blockers, shows its first 50. Under a list that holds more, a line in `--text-caption` and `--color-text-secondary` says how many are shown of how many ("50 of 312 shown"). Under a list of lines it is followed by the quiet button "Show all on Lines", which opens Lines with the filters of the bar and the blocker added to them (the Blocker dimension, its key): that table holds every line of the blocker, those it frees and those it shares, so the button names no count of its own. Its accessible name adds the list it stands under ("Show all on Lines: Frees on its own"), so the two buttons read apart. The panel closes on the way: under a filter that keeps only the blocker's holds, it would say that every line kept is freed by the blocker alone. It closes in the history as well: the entry the button leaves is the page without the panel, so going back does not show the panel under that filter. The linked blockers have no such destination; the line under them says that the 50 shown are those sharing the most lines ("50 of 214 shown: those that share the most lines"). Each of these lists of a blocker, the two lists of lines and the linked blockers, is one stop in the Tab order, so the sections after a long list are a few Tabs away: Tab enters a list on the row the keyboard was last on in it (the first at first), the up and down arrows move from row to row, Home and End to the first and the last row, and Enter or Space opens the row. Each row keeps its look, its focus ring, and its name; a screen reader still hears a list of buttons and its length.
- **A blocker the filters remove:** not an error. It is said of the filters the answer was read for: while other filters are read, the panel shows its first-load skeletons, not the empty state of before. When the filters of the bar keep no hold of the blocker, the body holds an empty state that says so and offers "Clear filters" as a secondary button, which sets the filters to the default and leaves the panel open on the blocker. With the default filters, a blocker without an open hold in the snapshot in view is said to be not in this snapshot, with "Close panel", as a line is.
- **Absent value:** a fact the hold does not have is written in words, as in every fact list ("Not given in the export"). A field the snapshot has no value for at all leaves its fact out, and a section that would be left empty is left out: released holds without the `Released` column, the sizes without the size columns.
- **Loading:** a first load shows the head, which is known before the data, and skeletons in the shape of the sections: the labels of the fact list with a block for each value, and two rows of blocks under each section title. A re-read, as after another snapshot is selected, keeps the content of before at `--opacity-stale` and marks the body as busy until the new answer is there. Content of another line, hold, or blocker never stands in: choosing another row shows skeletons. Another filter re-reads a blocker as another snapshot does.
- **Error:** an inline danger notice at the top of the body with "Try again". Content of before stays under it.
- **Empty:** a line that has no hold in the snapshot in view, or a hold position past its end, is not an error. The body holds an empty state, `--space-6` below the head, that says the line or the hold is not in this snapshot and offers "Close panel" as a secondary button.
- **Motion:** the panel enters by sliding from its own width at the trailing side to its place, with `transform` over `--duration-slow` and `--ease-out`. It leaves at once. Another line, hold, or blocker in the open panel replaces the content in place, with no motion. Under reduced motion it appears in place.
- **Keys and focus:** opening it with Enter on a row moves the focus to its heading; opening it with a press leaves the focus on the row. A row of the panel that opens another line, hold, or blocker in its place is gone once that one shows, so the focus goes to the heading. Every table that opens the panel follows these rules, the steps of Blockers and the lines of Breakdown as the rows of Lines, and so does a control beside the table that opens it as well (the curve of Blockers): Enter there moves the focus to the heading, Escape there closes the panel, and closing gives the focus back to the control the panel was opened from, the point of the curve or the row. Esc, with the focus in the panel or on the table, closes it, and the focus returns to the row that opened it, or to the table when that row is gone. The close button does the same. Esc inside a popover closes the popover only. The panel adds no shortcut of its own.

### Sidebar item

The sidebar lists all nine destinations in two groups: Overview, Breakdown, Lines, Blockers, History, People, Follow-up; then, set apart at the bottom of the sidebar above a hairline in `--color-border-subtle`, Rules and Settings. Between the two stand the saved views (see "Saved views").

- **Shape:** height `--density-nav-item-height`, horizontal padding `--space-2`, corner `--radius-sm`, an icon at `--size-icon` in the label's color with a `--space-2` gap, the label in `--text-label`. Items are `--space-0-5` apart inside a sidebar padded by `--space-2`.
- **Default:** transparent fill, label `--color-text-secondary`.
- **Hover:** fill `--color-surface-hover`, label `--color-text-primary`.
- **Active:** fill `--color-surface-pressed`.
- **Current:** fill `--color-accent-subtle`, label `--color-text-primary`, `aria-current="page"`. Hover on the current item: `--color-accent-subtle-hover`.
- **Focus:** the inset focus ring. `Ctrl+1` to `Ctrl+7` open the first seven destinations.
- **Where it leads:** an item and its shortcut open the destination at the address it last had in this session, with no line, hold, or blocker selected: Breakdown in the matrix it was left in, Lines in its mode. A destination not opened yet opens at its own address. The addresses are forgotten when another workspace opens, since they name values of the one before; they are not kept for the next start.
- **A second press resets:** pressing the item of the destination that is shown, or its shortcut (`Ctrl+3` on Lines), returns it to its default address (owner, 2026-10-19): the address is the destination's own (`/lines`), so its selected row, mode, grouping, and sort are gone; the page is drawn anew, so its selected rows are cleared and it is scrolled to the top; the remembered address of the destination is the default one from then on. The filters stay: they belong to the workspace, and not to a destination. Pressing another destination opens it where it was left, as above, and changes nothing in the one it left.
- **Disabled:** never. Every destination can be opened, including one that is not built yet.
- **Rail:** the sidebar can be collapsed to a rail `--layout-rail-width` wide, and expanded again, by the last item of the sidebar: a quiet icon button at `--density-nav-item-height`, below the second group, named "Collapse sidebar" or "Expand sidebar" with a tooltip that repeats the name, and `aria-expanded` saying whether the sidebar shows its labels. In the rail an item shows its icon alone, centered, in every state above. Its label and its Soon tag stay in its accessible name, so the name of an item is the same in both forms, and its tooltip shows them in text, with the shortcut, on keyboard focus at once and on hover after `--delay-tooltip`: never by hover alone. The choice is the user's at every width and is kept for the next start, on this computer. The content area takes the room the rail gives back; nothing slides.
- **Soon tag:** a destination that is not built yet shows a tag reading "Soon" after its label: next in reading order, and aligned to the trailing edge of the item so the tags form one quiet column. The tag text is part of the item's accessible name. The tag is the neutral tag below: `--size-tag-height` tall, text `--text-caption` in `--color-text-muted`, a `--border-width-thin` border in `--color-border-default`, no fill, no accent, no state color. The item keeps every state above; the tag does not change with them. `--color-text-muted` clears 4.5:1 on each fill the item can have.

### Saved views

A section of the sidebar that lists the saved views of the open workspace (owner, 2026-10-19). A saved view is a data screen's address without its selection (destination, mode, grouping, sort) and the filters, kept under a name in the workspace. It stands under the destinations of the data group and above Rules and Settings, and scrolls with the sidebar.

- **Title:** "Saved views", a line of `--text-caption` in `--color-text-muted`, as tall as a menu section's name, padded `--space-2` at the sides so it lines up with the labels of the items. The list of views is named by it.
- **Item:** a sidebar item (see "Sidebar item") with a bookmark icon and the name of the view, and every state of that item: default, hover, active, and current, with the same tokens. A long name is cut at the end with an ellipsis; its tooltip shows the whole name on keyboard focus at once and on hover after `--delay-tooltip`, only while the name is cut. The accessible name is always the whole name.
- **Applying:** one press applies the view: the filters of the workspace become the view's, then its address opens. The address is kept as its screen writes it in full (Breakdown with its mode and dimension written out), and two addresses are the same screen when their screen reads the same state from them, its selection left out. A filter on a field the snapshot in view lacks applies as well, and its chip is the dashed chip of "Filter chip". The item is current, `aria-current="true"`, with the fill `--color-accent-subtle` of a current item, while the address shown (its selection left out) and the filters are the view's; it stops being current as soon as either changes. No colored side stripe marks it. The destination of the view stays current in the group above at the same time.
- **A second press resets:** pressing the current view applies it again, and the page is drawn anew as for a second press on a destination: selected rows cleared, scrolled to the top, no line, hold, or blocker selected. Applying any view whose destination is the one shown draws the page anew in the same way.
- **Menu button:** each item has a quiet icon-only button at its trailing edge, `--density-nav-item-height` square, inside the item and over its fill, with an ellipsis icon at `--size-icon` and the name "Actions for <name>". It is in the Tab order of every item, right after the item's link. It shows while the item is current, while the focus is in the item, while its menu is open, and under the pointer; at other times it is transparent but still reachable, so it never shows by hover alone. The label of the item stops `--space-1` before it. Its menu holds Rename, Move up, Move down, and Delete; Move up is disabled on the first view and Move down on the last.
- **Rename:** the item becomes a text field in its place, at `--density-nav-item-height`, with the name selected. Enter saves, Escape cancels, and the focus leaving saves a changed name and closes an untouched one. A refused name keeps the field open with what was typed, marked invalid, and the reason under it in `--text-caption` and `--color-danger-text` with the error icon. The focus goes back to the item's menu button when the field closes by its keys.
- **Move up, Move down:** the view changes place once the workspace has answered; the focus is on its menu button in the new place.
- **Delete:** removes the view at once, without a prompt, and a toast says "Deleted view <name>" with Undo, which puts it back where it was (see "Toast"). The focus moves to the next view, or to the one before when it was the last, or to the section when none is left. An undo that cannot be done, because another view has taken the name meanwhile, says why in a toast in the danger tone (see "Toast").
- **Empty:** one quiet line in `--text-caption` and `--color-text-muted`, padded as the title: "Save the filters and screen you use often from the filter bar."
- **Rail:** the section is one quiet icon-only button with the bookmark icon, centered as the items of the rail are, named "Saved views", with its tooltip. It opens a menu beside it on the trailing side, titled "Saved views", whose items are the views by name, the current one checked; choosing one applies it. Without views the menu holds the empty line as a disabled item.
- **While an action on the workspace runs:** an item opens nothing (it is announced as unavailable and busy, `aria-disabled` and `aria-busy`, and keeps its look), the items of its menu are disabled, and the rail menu's items as well. The filters and the address cannot be set while the workspace may change.
- **Loading and error:** the list comes with the workspace and has no loading state. A change that the workspace refuses (a name taken, too long, too many views) is said inline where it was typed, once, also when the focus left the field; one that fails otherwise is said in a toast in the danger tone.

### Tag

A small, non-interactive label on a row or an item.

- **Shape:** height `--size-tag-height`, horizontal padding `--space-1-5`, corner `--radius-sm`, text `--text-caption`. One line, never wrapped and never cut: a tag holds a word or two.
- **Neutral:** text `--color-text-muted`, `--border-width-thin` border in `--color-border-default`, no fill. Used for "Soon" and for plain facts such as "Limited".
- **State:** fill, border, and text from one state (for example `--color-warning-subtle`, `--color-warning-border`, `--color-warning-text`), always with an icon at the leading edge. The four states are info, warning, danger, and success.
- **Icon:** at `--size-icon`, in the color of the text, `--space-1` before it. A state tag cannot be built without one; a neutral tag may have one and usually has none. The icon is decoration to assistive technology: the text of the tag says what it means.
- **States:** none. A tag is not interactive: it takes no focus and has no hover, active, disabled, loading, or error state, and it keeps its look in every state of the row or the item it sits on. Its text is part of what that row or item reads to assistive technology.

### Filter chip

- **Shape:** height `--size-chip-height`, horizontal padding `--space-2`, corner `--radius-full`, text `--text-label`. Chips are the only pills in the interface: round means a filter that can be removed. A chip has no padding at its trailing side: the circle of its remove button ends the pill, and stands `--space-1` after the value. The add-filter chip has `--space-2` at both sides.
- **Active filter:** fill `--color-accent-subtle`, `--border-width-thin` border in `--color-accent-border`, the field name in `--color-text-secondary` and the value in `--color-text-primary`, and a remove button at the trailing edge. Hover `--color-accent-subtle-hover`.
- **Two controls in one pill.** The field name and the value are one button, which opens the filter to change it. The remove button is a second one: a circle as tall as the chip inside its border, with an X at `--size-icon` in `--color-text-secondary`, `--space-1` after the value. Its accessible name says which filter it removes, and it has a tooltip, as every icon-only button has. While a popover of the screen is open over the page, such as the filter picker, the tooltip is off: the page behind the popover cannot be reached, and a chip that the popover adds meanwhile has nothing to describe until it closes.
- **A negated filter** reads the field name, then "is not" and the value. "Is not" is written in the ink of the value, `--color-text-primary`, so the negation is read with the value it turns around and cannot be skipped as part of the label.
- **The value** is each value under the label the picker gives it. A value set from a search result carries the label the result names; a value of a saved view applied after a restart, for a dimension whose keys are not its labels (a remark, a blocker), is labelled by the Rust side for the snapshot in view, and shows its key until the label is there. A key the snapshot lacks shows the key itself.
- **A long value** is cut at the end with an ellipsis: a chip is at most `--size-chip-max-width` wide. The accessible name of the chip is always the full text, and the picker it opens lists every value.
- **Active (pressed):** fill `--color-accent-subtle-hover`, as on hover. The chip keeps that fill for as long as its picker is open.
- **Remove button:** hover and pressed give the circle the fill `--color-accent-subtle-hover`, a `--border-width-thin` hairline in `--color-accent-border` around it, and the X the ink `--color-text-primary`, while the rest of the chip keeps its fill at rest, so it is clear which of the two controls the pointer is on. The hairline is what still reads when the chip already has that fill, as it has for as long as its picker is open: the fill then changes nothing, and the hairline and the ink mark the circle. Its focus ring is inset, so it is not taken for the ring of the chip.
- **Add filter:** a quiet button in the same pill shape with a `--border-width-thin` border in `--color-border-strong`. A plus icon at `--size-icon`, a `--space-1` gap, and its label, in `--color-text-secondary`. Hover: fill `--color-surface-hover`, text `--color-text-primary`. Active, and while its picker is open: fill `--color-surface-pressed`.
- **Disabled:** while the filters cannot be changed (an import is running, or the snapshot is being switched), every chip has fill `--color-surface-disabled`, a border in `--color-border-default`, and text in `--color-text-disabled`. It has no remove button, but the X stays where it was, in `--color-text-disabled`, as a picture: it takes no focus and no press and is hidden from assistive technology. So a disabled chip is exactly as wide as it was, and nothing beside it moves when the chips are disabled and enabled again. Disabled chips are not focusable, and a sentence of `--text-caption` in `--color-text-muted` in the bar says why.
- **Not in this snapshot:** a filter that needs a column the snapshot in view has no value in, a built-in column or a custom one, stays as the user set it and is sent as it is; every data command leaves it out of what it applies, because applied it would test empty values, and the filter options name it (`inactive`). Its chip is marked from that answer and keeps its field and value as any chip does: it takes the fill of a disabled chip, `--color-surface-disabled`, and a `--border-width-thin` dashed border in `--color-border-strong` (3:1 against the chip's fill and the filter bar's, in both themes, which `--color-border-default` is not), so its outline says at a glance that it is not applied; its text is not muted: the field, the value, and the X are in `--color-text-primary`, as is a small icon (`CircleSlash` at `--size-icon`) `--space-1` before the field (owner, 2026-10-19). Unlike a disabled chip it can be focused, opened, and removed: hover, pressed, and for as long as its picker is open, fill `--color-surface-hover`; its remove button on hover and pressed takes the fill `--color-surface-pressed`, a hairline in `--color-border-strong`, and the X in `--color-text-primary`. The icon is decoration to assistive technology; the name of the chip's first button ends with ", not in this snapshot" ("Discipline Civil, not in this snapshot"), which is not shown in the pill, and its tooltip, on hover and on keyboard focus at once, reads the same. No text is added inside the pill, so the value has the room of any chip and two filters on the same field, such as "Model and LDT sizes differ" and "Model and LDT sizes match", read apart. Disabled, it looks as every disabled chip does, the icon in `--color-text-disabled`, and keeps the dashed outline. The line of missing columns under the controls says that such filters are kept and not applied. The marks are those of the filter options shown: while those are an answer for the filters or the view of before, a marked chip is at `--opacity-stale`, as the total is, until the new answer is there. While the filter options cannot be read, which filters the snapshot cannot apply is not known: no chip is marked, and the line under the controls says so ("Which filters this snapshot cannot apply is not known until the counts are read."), beside the error notice of the bar.
- **Loading:** a chip has no loading state of its own. A filter applies at once: the chip appears in its final look, and the content it filters keeps its previous render at `--opacity-stale` until the new rows arrive. While the add-filter picker reads its values, the picker shows the spinner (`--size-icon`) beside a label in `--text-caption`.
- **Error:** a chip has no error state. A filter that could not be applied is said by an inline notice above the content it filters.
- **Focus:** the focus ring on the chip and on its remove button separately. Backspace on a focused chip removes it, and so does Delete, whichever of its two controls has the focus.
- **Clear all:** a quiet button at the end of the row, visible while there is a chip. The status is a filter that is always set and has no chip, so a status other than open holds alone does not show it.
- **Transitions:** fill, border, and text color over `--duration-fast` with `--ease-out`.

**The filter bar, composed.** A region under the page header of a data screen, as wide as the content area whatever the width of the page: fill `--color-surface-panel`, a hairline in `--color-border-default` above and below, at least `--layout-filterbar-height` tall, `--space-4` under the header and `--space-4` above the content. What it holds keeps the width of the page and its padding, so it starts where the page title starts and ends where the content ends. From the leading edge, `--space-2` apart and in Tab order:

1. **The status control.** Which holds are shown (open, released, or all) is a filter that is always set. It is not a chip, because it cannot be removed, and round means a filter that can be. It is a menu button (see Menu) whose label is the status in view ("Open holds") and whose menu holds the three as a choice, the one in view checked, each with the count of holds it would keep as its detail. The counts are the two the command gives, for open and for released. "All holds" has no detail: its count would be the sum of the two, and the interface adds nothing up. A status that needs the `released` column is not offered for a snapshot that lacks it; the one in view is always listed, so that it can be left. The label of the button starts where the page title starts, so its hover fill reaches into the page padding.
2. **One chip per active filter**, the filters on a field first, in the order they were added, then the filters that are not a field (age, creation date, release date, whether the two sizes differ, text), each of which has one chip. A chip reads its values: one by its label, two as a list ("Civil, Piping"), more as the first and how many more ("Civil +3"). An age band and a range of days are written in words ("0 to 13 days", "from 1 Sept 2026"), the size filter as what it keeps ("Model and LDT sizes differ"), and the text that was typed stands in quotation marks.
3. **Add filter.**
4. **Clear all**, while there is a chip. It removes every chip and sets the status back to open holds. It stays beside "Add filter": the two wrap to a next line together, so the line starts with the pill, on the line of the chips above, and never with the label of a quiet button, which stands in from its edge.

- **Save view** stands after the trailing part, at the end of the first line, `--space-4` from the total (see "Save view popover").
- **The trailing part** of the bar is `--size-filterbar-end-width` wide, on the first line, whatever it holds, so the controls have the same room at all times. What it holds is set to its trailing edge.
- **The total** the filters keep stands there: `--text-label` in `--color-text-secondary` with tabular figures ("2,418 holds"). On a first read a skeleton line stands in its place. While it is read again it stays at `--opacity-stale`, as the content it counts does.
- **More chips than fit** wrap to a next line, `--space-1-5` under the first, and the bar grows. The total stays on the first line. The bar never scrolls sideways and no chip is hidden behind a count.
- **Focus after a removal:** removing a chip moves the focus to the chip after it, or to "Add filter" when it was the last. "Clear all" moves it to "Add filter". The focus is never left on the page behind.
- **Disabled:** while an action on the workspace runs, the chips and "Add filter" are disabled as above and "Clear all" is a disabled button. The status control waits as a menu button waits for another control: it keeps its look, opens nothing, and is announced as busy. One sentence says why ("Which line says why"), in the trailing part of the bar, in the place of the total: the total says nothing certain while what it counts is on its way. `--text-caption` in `--color-text-muted`, set to the trailing edge, short enough for two lines of that width ("Waiting for the snapshot."), which are as tall as a control. It is in a region that is always there and is announced politely.
- **Nothing moves** when an action starts or ends: the bar is as tall as it was, and every control is where it was. The chips keep the room of their remove circles, the trailing part keeps its width, and the sentence takes the place of the total and no line of its own.
- **Missing columns:** when the snapshot in view has no value in a column of the export, one line under the controls says which, by the names PlantIM gives them ("model_size, ldt_size"), and that what needs them is not offered: `--text-caption` in `--color-text-muted`, at most `--layout-prose-max-width` wide. It is said once, here, and not again beside each filter or column that is absent, and not by the page under the bar. While a filter is set that the snapshot cannot apply, the line ends with one more sentence: that filters on columns this snapshot lacks are kept, and not applied to it. That sentence is there also when the only such filter is on a custom column, which the line does not name.
- **No released hold:** a snapshot in which no hold is released, because its file had no column that says so or because none is yet, gets a sentence of its own in that line, before the columns: that no hold in it is released and only open holds can be shown. The columns `released`, `release_date`, and `release_remark` are then not named as missing: for a complete export in which nothing is released yet, that would be untrue.
- **Until the counts are there** for the first time, only the open holds are offered, with the status in view. After another snapshot or workspace was opened, the line and the statuses offered are those of before until the new answer is there; the line is then at `--opacity-stale`, as the total is.
- **Error:** when the counts could not be read, an inline danger notice under the controls says so, with "Try again". The total is not shown; the chips stay and can still be changed.
- **Where it is:** on every destination that shows the holds of the snapshot in view. Not on Settings, the welcome page, the import flow, or a coming soon screen, and not while the workspace has no snapshot: there is nothing to filter, and the empty state says what to do.

### Popover

A small surface that opens from a control and holds controls of its own: the filter picker. It is what a menu is for a list of items, for anything that is more than a list.

- **Surface:** that of a menu: fill `--color-surface-overlay`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-md`, `--shadow-overlay`, at `--z-dropdown`. Padding `--space-3`; its parts are `--density-stack-gap` apart.
- **Size:** `--size-popover-width` wide, whatever it holds, so it does not change width while a list inside it is read again. It is never taller than the room between its control and the edge of the window. When it holds more than fits, the list inside it scrolls and the popover does not.
- **Placement:** under the control that opened it, `--space-1` away, leading edges lined up. Where there is no room below it opens above, and where there is none at the trailing side it lines up with the trailing edge.
- **It keeps its place.** A popover that one of several controls can open, as any chip of the filter bar and "Add filter" open the filter picker, stands under the place that control had when it opened, and keeps that place for as long as it is open. What is chosen in it may widen, move, or remove the control, and the popover does not follow: nothing moves under the pointer of a user who ticks one value after another.
- **Opening:** as a menu: it fades in and moves `--space-1` toward its place over `--duration-base`, leaves by fading over `--duration-fast`, and fades in place under reduced motion.
- **The control that opened it** keeps its pressed look and has `aria-expanded="true"` for as long as the popover is open.
- **Focus:** opening moves the focus into the popover: to the first field it holds, such as a search field, because a popover with a field is opened to type in it; without a field, to the first list it holds, on its ticked option, or on its first item when none is ticked, because a popover that is a list is opened to choose from it; and otherwise to the popover itself, which then shows the inset focus ring. When what the popover holds is replaced while it is open, as the list of fields is by the editor of the field that was chosen, the focus is taken into the new content by the same rule. Tab moves through the controls inside and stays inside. Esc, or a press outside, closes it, and closing gives the focus back to the control that opened it, or, when that control is gone, to the control the screen names for it.
- **No scrim:** nothing is laid over the page. It stays as it is behind the popover, undimmed, and what the popover changes shows there at once. The page cannot be reached while the popover is open (Tab stays inside, and a press outside closes it), which is what a menu does as well.
- **What it may hold:** fields, a choice group, an option list, quiet buttons, and text. A quiet button inside takes the hover fill `--color-surface-overlay-hover`. It never holds a primary button: an overlay does not carry one (the Two Surfaces Rule), and a popover has nothing to confirm, because what is chosen in it applies at once. The one exception to the last is the "Columns and rows panel", whose choice applies to exports not yet made: it confirms with a secondary button.
- **Name:** it is a dialog to assistive technology and has an accessible name that says what it is for ("Filter by discipline").
- **Disabled:** a popover is not disabled; the control that opens it is.
- **Loading and error:** belong to what it holds. A list inside shows its own loading state, and a reading that failed is an inline danger notice inside the popover with "Try again".

### Option list

A list of values to choose from, one or several, each with the count of what it would keep. It is the body of the filter picker.

- **Shape:** options one under the other, with no gap between them. At most `--size-option-list-rows` rows show; a longer list scrolls inside itself. The list has no border and no fill of its own: it lies on the surface of what holds it.
- **Option:** at least `--density-row-height` tall, horizontal padding `--space-2`, corner `--radius-sm`, and `--space-2` between its parts: the mark, the label, and the count. The room above and below its text is what one line has in a row, so an option of one line is exactly as tall as a row and one of several lines keeps clear of its neighbours.
- **Label:** `--text-body` in `--color-text-primary`. A label that does not fit wraps and the option grows; it is not cut, because two long values often differ only at the end. The mark and the count stay beside its first line: the mark in the middle of that line, the count on its baseline.
- **Count:** at the trailing edge, formatted with its thousands separated, in `--text-table` and `--color-text-secondary`, right-aligned on tabular figures so the counts of a list form a column. The count describes the option to assistive technology; the label alone is its name.
- **Mark, several values:** the box of a checkbox at the leading edge, with every look of that box: unticked, fill `--color-surface-field` and border `--color-border-strong`; ticked, fill `--color-accent`, border `--color-accent-text`, and the check mark in `--color-text-on-accent`.
- **Mark, one value:** the circle of a choice group, with its dot when chosen. The mark is what says whether choosing another value adds to the choice or replaces it, so it is always shown.
- **Highlighted:** by the pointer or by the arrow keys, fill `--color-surface-overlay-hover` inside an overlay and `--color-surface-hover` elsewhere, and the border of an unticked mark becomes `--color-text-secondary`, as a checkbox does on hover.
- **Active (pressed):** the highlighted fill stays, and the mark takes its pressed step.
- **Chosen:** the mark is ticked. The label keeps its weight, so ticking a value never changes where a line breaks.
- **Focus:** the list is one stop in the Tab order. The arrow keys move through the options, Home and End jump to the ends, typing jumps to a match, and Space or Enter ticks and unticks the option the keyboard is on. Esc unticks nothing: it goes on to what holds the list, and a popover closes on it. That option shows the inset focus ring; an option the pointer is on shows the fill only.
- **A count of zero:** label and count in `--color-text-muted`. The option can still be chosen, so a value that was ticked before and no longer matches anything can be unticked.
- **Empty:** one line in `--text-caption` and `--color-text-muted`, as tall as an option, that says what is absent ("No value matches"). It is never left blank. With no option to carry the focus, the list itself is the stop for Tab, and shows the inset focus ring while the keyboard is on it.
- **Loading, first read:** the spinner at `--size-icon` and a label in `--text-caption` and `--color-text-muted` beside it, in place of the options. The list is marked as busy. As when it is empty, the list is the stop for Tab and shows the inset focus ring itself.
- **Loading, a re-read:** the counts stay at `--opacity-stale` until the new ones arrive, and the list is marked as busy meanwhile. Only the counts are dimmed, because only they are being read again: labels and marks keep their ink, so every option, one written in the muted ink included, stays readable for as long as it can be ticked.
- **Disabled:** not applicable. A value that cannot be chosen is not listed, and while nothing can be changed the control that opens the list is disabled.
- **Error:** an inline danger notice in the place of the list, shown by the screen that reads the values.
- **Footer:** an optional line under the list that does not scroll with it, in `--text-caption` and `--color-text-muted`, with the horizontal padding of an option. It says what the list leaves out: "1,300 more values. Type to narrow."
- **No search field of its own.** Where a list can be longer than what is shown, a text field above it narrows it. The field is a part of what holds the list, not of the list.

The option list is composed with a field and a choice in the filter picker; see "Filter picker".

### Filter picker

What "Add filter" and a chip of the filter bar open: a popover in which a filter is set. It has two views. The list of fields says what can be filtered; an editor sets the filter of one field. Opened from "Add filter" it shows the list, and choosing a field replaces the list by that field's editor. Opened from a chip it shows the editor of the chip's field at once. It is the filter list of a spreadsheet, which this audience knows: a box to type in, and under it the values to tick.

- **One picker, and nothing to confirm.** Everything set in it applies at once: the chip appears, changes, or goes in the bar behind it, and the content it filters is read again. The popover stays open until Esc or a press outside. It holds no button that applies, closes, or goes back. The way to another field is Esc and "Add filter", which then has the focus.
- **Name:** the popover is named "Add filter" while it shows the list of fields, and "Filter by" and the name of the field while it shows an editor ("Filter by Discipline").
- **The control that opened it** keeps its pressed look and `aria-expanded="true"`. A chip that goes while the picker is open, because its last value was unticked, hands both to "Add filter", and closing then gives the focus to "Add filter". A chip of the same field that comes back, because a value was ticked again, takes them back, and closing gives the focus to it.
- **An action that starts** while the picker is open, such as the selection of another snapshot, closes it, because nothing can be changed while it runs. Every control of the bar is disabled then, so the focus goes to the filter bar itself, which shows the inset focus ring and whose sentence in the place of the total says why.
- **A field is named as its chip names it:** by the name its column has everywhere else in the interface ("Raised by", "Hold remark", "Line ID"), and a custom column by its header.

**The list of fields.** The items of a menu (see Menu), on the surface of the popover and with nothing else in it.

- **Item:** at least `--density-row-height` tall, horizontal padding `--space-2`, corner `--radius-sm`, the name of the field in `--text-body` and `--color-text-primary`, on one line. The list is pulled out by `--space-2` at both sides, as an option list is, so a highlighted item stops `--space-1` from the edge of the popover.
- **Order:** fixed, so a field is always in the same place: the fields of the export and of the blocker rules, then age, the two dates, the sizes, text, and last the custom columns of the snapshot, by header. A field that needs a column the snapshot has no value in is not listed; the filter bar says once which columns are missing.
- **A field that has a filter** carries what it is filtered to as the detail of its item, `--space-4` after its name: `--text-caption` in `--color-text-muted`, as its chip reads it ("Civil +3", "is not Vendor data"), cut at the end with an ellipsis so the name always shows whole. Choosing such a field opens its editor with what is set. The detail describes the item to assistive technology.
- **Highlighted, focus, pressed:** as an item of a menu: fill `--color-surface-overlay-hover` by the pointer or the arrow keys, the inset focus ring on the item the keyboard is on.
- **Behavior:** the list takes the focus when the popover opens, on its first field. The arrow keys move, Home and End jump to the ends, typing jumps to a match, Enter or Space chooses. It is one stop for Tab.
- **Height:** every field shows while the window has the room. Where it has not, the list scrolls inside the popover.
- **Loading:** until the options of the snapshot are there for the first time, the spinner and a label in `--text-caption` stand in the place of the list, as in an option list, because which fields the snapshot has is not known yet. While they are read again the list of before stays and can be used.
- **Error:** when the options could not be read, an inline danger notice with "Try again" stands in the place of the list.
- **Empty and disabled:** not applicable. A snapshot always has fields to filter by, and while nothing can be changed "Add filter" is disabled.

**The editor of a field of values** (discipline, hold type, role, raised by, blocker type, blocker, hold remark, line ID, model size, stress calculation, and every custom column). From top to bottom and in Tab order:

1. A text field that narrows the values. Its label is the name of the field. Its placeholder says what typing does ("Type to narrow"): the label is taken by the name, and the list under the field answers each key. It takes the focus when the popover opens. What is typed is sent when the renderer has caught up with the keys, which may be at each key on a fast machine, and never on a timer of the interface.
2. A choice group in a row, labeled "Condition": "Is" and "Is not". It applies to the whole field and can be set before a value is ticked.
3. The option list of the values, several to choose, each with the count of holds it would keep. The counts are those of every other filter in force without this field's own, so a value that is not ticked shows what ticking it would add. The list is pulled out by `--space-2` at both sides, so the fill of a highlighted option stops `--space-1` from the edge of the popover, as an item of a menu does, and the labels of the options start on the same line as the field above.
4. The footer of the list, when more values exist than are listed: how many more, and that typing narrows ("1,300 more values. Type to narrow.").

- **Ticking** applies at once and the popover stays open. The counts are then read again: they are dimmed until the new ones arrive (see Option list), and the options keep their order and their place, so the next value can be ticked without looking for it.
- **Unticking the last value** removes the filter and its chip. The editor stays as it is, with the condition that was chosen.
- **A ticked value the list would not show** is shown first, under the label it was ticked under, so it can be unticked: with the count 0 in the muted ink when the answer holds every value, because no hold has it any more under the other filters; without a count when the answer holds only the first of many, because its count is then not known and the interface invents no number. While text is typed, the list holds what matches the text and nothing else; the ticked values are back when the field is cleared.
- **Loading, first read:** the loading state of the option list. The field and the choice are there and can be used.
- **Loading, a re-read:** after a tick, and after every change of the text: the counts dimmed, the list marked as busy.
- **Empty:** the line of an empty option list. With text typed it names the text ("No value matches “flange”."). Without, it says why there is nothing: the other filters keep no hold.
- **Error:** an inline danger notice with "Try again" in the place of the list. The field and the choice stay.

**The editor of age.** The name of the field as a label (`--text-label`, `--color-text-secondary`), `--space-1` above an option list of the age bands of the workspace, several to choose, each with its count. A band is written in words ("0 to 13 days", "90 days or more"). The list has the focus when the popover opens. A ticked band that is no longer one of the bands is listed first, without a count. Loading, re-read, and error are those of the list of fields, because the bands come with the same answer.

**The editor of a date** (creation date, release date). The name of the field as a label, then two text fields one under the other, "From" and "To", each as wide as the popover so that its helper line has room.

- **Typing:** year, month, day ("2026-10-01"), the form the import review takes. The placeholder is an example. "From" has the focus when the popover opens.
- **Helper line:** how to write a date, and once the field holds one, that date in words with its weekday, so a day taken for a month shows.
- **Applies** as soon as a field holds a whole date, and when a field is emptied: one bound is enough, and the chip reads "from" or "until". Nothing waits for Enter. While a field holds text that is not yet a date, the bound it had stays in force.
- **Error, a date that cannot be read:** shown when the field is left or Enter is pressed, not while it is typed: the field in its error state, the message in the place of the helper line, saying how to write a date.
- **Error, "From" after "To":** shown at once, at the field that was changed last, in the place of its helper line: which of the two days is the wrong side of the other, by its date, and what to enter. Nothing is sent, and the range of before stays in force until the two agree.

**The editor of the sizes.** The name of the field as a label ("Model and LDT sizes"), then an option list of two values, one to choose, each with its count: "Differ" and "Match". The mark is the circle of a single choice; choosing the chosen value again removes the filter. The list has the focus when the popover opens. When the counts could not be read the two values are listed without counts and can still be chosen; the filter bar says what failed.

**The editor of text.** One text field labeled "Text", with a helper line that says where the text is looked for. It has the focus when the popover opens. What is typed applies on Enter, when the field is left, and when the popover closes, and not at every key, because each change reads the whole page again. An empty field removes the filter.

### Save view popover

What "Save view" in the filter bar opens: the name under which the screen shown and its filters are saved. It is a popover (see "Popover") with a field and one button.

- **The trigger:** a quiet button with a bookmark-plus icon, reading "Save view", at the trailing end of the filter bar's first line, after the total, `--space-4` from it. It is on the four data screens wherever the filter bar is. While an action on the workspace runs it is inert, as a button that waits for another control is, and opens nothing.
- **Placement:** under the trigger, lined up with its trailing edge; the popover's surface, size, and motion.
- **Field:** a text field labelled "Name", holding a proposed name: the name of the destination, then, when a chip is set, " · " and the value of the first chip ("Lines · Civil"), at most 80 characters. The field takes the focus with the name selected, so typing replaces it.
- **Save:** a secondary button under the field, `--density-stack-gap` below it, aligned to the trailing edge. A popover carries no primary button (the Two Surfaces Rule). Enter in the field saves as well. While the save runs the button shows its spinner and the field is read-only.
- **After saving:** the popover closes, the focus goes back to the trigger, the new view is at the end of the list and current, and a toast says "Saved view <name>".
- **Errors:** inline, in the field's error line: a name that is empty or longer than 80 characters, too many views, and any other refusal, in the words of the command. A name that another view has, without regard to case, names that view, and a quiet button "Replace it" stands under the message: it deletes that view, with the toast and its Undo as a delete from the sidebar, and saves this one under the name.
- **Disabled:** never; the trigger is inert instead.

### Search field

The one field that finds a line, a blocker, a person, a remark, or a hold value in the snapshot in view. It stands in the top bar, and its results open under it in groups. It is a combobox: the focus stays in the field while the arrow keys move through the results.

- **Place:** in the top bar, after the workspace switcher and before the snapshot selector. It grows up to `--layout-search-max-width` and gives way down to `--layout-search-min-width`; below that the name of the workspace gives way, as it does for every control of the bar. It is shown only while the open workspace has a snapshot in view. Without one it is absent: there is nothing to find.
- **Field:** the box of a text field, with its height, fill, border, corner, text, hover, and focus. A search icon at `--size-icon` in `--color-text-muted` stands at the leading edge, `--space-1-5` before the text. The top bar has no room for a label above it, so the icon and the placeholder show what it is, and its accessible name is "Search". The placeholder is "Search lines, blockers, people, remarks", in `--color-text-muted`.
- **The key:** while the field is empty and does not have the focus, the key that focuses it, `/`, stands at its trailing edge as a key cap: `--text-mono` in `--color-text-muted`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-xs`, `--size-tag-height` tall and at least as wide, padding `--space-1` at the sides; the text of the field stops `--space-1-5` before it. The cap is decoration to assistive technology; the field names the key as its keyboard shortcut.
- **When it opens:** once what is typed holds 2 characters, white space at the ends left out. A shorter text finds nothing, so nothing opens. What is typed is sent when typing has stopped for 150 ms, not at every key.
- **Results:** the surface of a menu (fill `--color-surface-overlay`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-md`, `--shadow-overlay`, padding `--space-1`, at `--z-dropdown`), `--layout-search-max-width` wide whatever the width of the field, so a remark has room and the list keeps its width as the window changes. It stands under the field, `--space-1` away, leading edges lined up, and opens and leaves as a menu does. It is never taller than the room under the field; the list scrolls inside it.
- **Groups:** Lines, Blockers, People, Remarks, and Holds, in that order; a group without a result is left out. Each starts with its heading, a line of `--text-caption` in `--color-text-muted` as tall as an item and lined up with the text of the results: the name of the group and how many results it has in all, "Lines · 12". The groups are sections of the list to assistive technology, named by their headings.
- **A result:** an item of the list, at least `--density-row-height` tall, horizontal padding `--space-2`, corner `--radius-sm`, `--space-2` between its parts. Its text comes first, in `--text-body`, and a line ID in `--text-mono`. The parts of the text that matched are in `--font-weight-semibold` and `--color-text-primary`, the rest in the regular weight and `--color-text-secondary`: weight and ink mark the match together, never a color alone. A text that does not fit wraps; it is not cut, because a remark is shown up to 120 characters and two remarks often differ at the end. Under it, when the result has one, its detail in `--text-caption` and `--color-text-muted`: the role of a person, and for a role or a hold value the name of its field ("Hold type", "Discipline"), so that two values that read alike in different fields are told apart. At the trailing edge, beside the first line of the text: a neutral "Released" tag when every hold of the result is released, then the number of its holds in `--text-table` and `--color-text-secondary`, on tabular figures and right-aligned. The number describes the result to assistive technology ("6 holds"); the text is its name.
- **More in a group:** when a group has more results than it shows, its last item says how many more and where they are: "4 more in Lines" for Lines, People, Remarks, and Holds, "4 more in Blockers" for Blockers. It is an item like the others, in `--text-body` and `--color-text-secondary`, without a count.
- **Highlighted:** by the pointer or by the arrow keys, fill `--color-surface-overlay-hover`. The item the keyboard is on also shows the focus ring, inset, as an item of a menu does.
- **Choosing a result** (owner, 2026-10-19). A line opens Lines with the line in the detail panel. A blocker opens Blockers with the blocker in the panel. A person, a role, a remark, or a hold value becomes the filter of its field, in place of the values that field was filtered by, and Lines opens in a row per hold. "N more in Lines" sets what is typed as the text filter and opens Lines; "N more in Blockers" does the same on Blockers. A line chosen while Lines shows its lines keeps the page's sort and the rest of its address; from the hold rows, Lines turns to its lines. A result whose holds are all released also sets the status to All when the status hides released holds (owner, 2026-10-23), whatever its kind, so its rows can be seen; the status control shows the change, and a result that still has open holds leaves the status as the user chose it. A value is set as a filter by the key the command returned for it, which is the key the filter of its field takes. The field is then emptied, and the focus goes to the heading of the panel that opened, or to the table of the page.
- **Enter with no result highlighted** sets what is typed as the text filter: of the page shown when it is a data destination, and of Lines from any other page, which then opens. The field is emptied, and the focus goes to the table of the page when it has one; on a page without a table it stays in the field.
- **Escape** closes the results and keeps the text; a second Escape empties the field. The focus stays in the field either way.
- **Waiting, first:** while no answer has come yet, one skeleton line stands in the place of the results, and the list is marked as busy.
- **Waiting, again:** while the answer for what is typed now is on its way, the results of before stay, at `--opacity-stale`, and the list is marked as busy. An answer is matched to the text it was asked for, so the answer for an older text is never shown as the answer for the new one.
- **Nothing found:** one line in `--text-body` and `--color-text-secondary`, as tall as an item: "Nothing matches “…”. Press Enter to filter by this text."
- **Error:** what failed, in `--text-body` and `--color-danger-text`, with the error icon before it, then an item "Try again" that the arrow keys reach like a result, so the retry stays in the field's keys.
- **Announced:** a polite status inside the results popover (while it is open, what lies outside the field and its popover is hidden from assistive technology) lists the headings of the groups ("Lines · 12, Blockers · 2"), or says that nothing matches, or that the search failed, once the answer for what is typed has come.
- **Disabled:** never. While an action on the workspace runs, the field stays editable and the search waits for the action, in the waiting states above.
- **Reduced motion:** as a menu: the results fade in place.

### Command palette

The one place every destination and action of the app is reached from the keyboard, with the saved views, the snapshots, the workspaces, and the line IDs of the snapshot in view. It is one of the two modals the app has (the other is the shortcut sheet).

- **Opening:** `Ctrl+K` opens it from anywhere: on any page, in a text field, and over an open menu or list. A second `Ctrl+K`, Escape, or a press on the scrim closes it, and the focus goes back where it was. While it is open, no other shortcut of the app fires: its keys are its own.
- **Scrim:** `--color-scrim` over the whole window. It is the overlay that holds the surface, so the two stand together at `--z-modal`: above every menu and popover, under toasts and tooltips. The page behind cannot be reached while the palette is open.
- **Surface:** fill `--color-surface-overlay`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-lg`, `--shadow-modal`, at `--z-modal`. `--size-palette-width` wide whatever it lists, centered across the window, its top `--size-palette-offset` below the top of the window. It is never taller than `--size-palette-max-height`, nor than the room under its top; the list scrolls inside it and the field stays.
- **Field:** at the top, the full width of the surface, `--density-control-height` tall, padding `--space-2` around it, then a `--border-width-thin` hairline in `--color-border-default` from edge to edge. A search icon at `--size-icon` in `--color-text-muted` at its leading edge, `--space-1-5` before the text; the text in `--text-body` and `--color-text-primary`, on the overlay with no box of its own. The field shows the focus ring, inset, while the keys act in it; once the arrow keys are on an item, that item has the ring and the field none, so one ring shows where the keys act. The placeholder, in `--color-text-muted`, is "Type a command, a page, or a line ID". It takes the focus on opening, with no text. Its accessible name is that of the palette, "Command palette"; the focus stays in it while the arrow keys move through the items.
- **Groups:** Actions, Destinations, Saved views, Snapshots, Workspaces, and Lines, in that order; a group without an item is left out. Each starts with its heading, a line of `--text-caption` in `--color-text-muted` as tall as an item, lined up with the labels. The groups are sections of the list to assistive technology, named by their headings.
- **With no text:** Actions and Destinations, then, under the heading "Recent", the five items chosen last in this session that can still run, the last chosen first.
- **Narrowing:** as text is typed, the items of the first five groups are narrowed by it: every word typed must start a word of an item's label or of its keywords, without regard to case, and the items keep their order. From 2 characters on, the Lines group lists the line IDs the search command finds for the text (Lines only, at most 8), as the search field finds them. The highlight is on the first item.
- **What is offered:** what can run now. An item that needs a workspace or a snapshot is left out without one; an item whose own control waits while an action on the workspace runs (a snapshot, another workspace, a saved view, Clear all filters, Save view) is left out meanwhile; "Export this view" is offered where `Ctrl+E` works, and "Save view" where the filter bar has it. A theme or a density that is already set is not offered again, nor the snapshot in view, nor the open workspace.
- **Item:** at least `--density-row-height` tall, horizontal padding `--space-2`, corner `--radius-sm`, `--space-2` between its parts: an optional leading icon at `--size-icon` in `--color-text-muted` (the icon of a destination, as in the sidebar), the label in `--text-body` and `--color-text-primary` on one line, cut at the end with an ellipsis, then at the trailing edge, in this order, a neutral tag where the sidebar has one ("Soon"), the detail in `--text-caption` and `--color-text-muted` (the holds of a snapshot), and the shortcut. A line ID is set in `--text-mono`, the parts that matched in `--font-weight-semibold`, as in the search field, with the number of its holds at the trailing edge in `--text-table` and `--color-text-secondary`, and a neutral "Released" tag before it when every hold of the line is released.
- **Shortcut:** each key a key cap: `--text-mono` in `--color-text-muted`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-xs`, `--size-tag-height` tall and at least as wide, padding `--space-1` at the sides, the caps `--space-0-5` apart ("Ctrl", "3"). The caps are decoration to assistive technology; the item names its shortcut with `aria-keyshortcuts`.
- **Highlighted:** by the pointer or by the arrow keys, fill `--color-surface-overlay-hover`. The item the keyboard is on also shows the focus ring, inset, as an item of a menu does.
- **Choosing:** Enter or a press runs the item and closes the palette at once. A destination, a saved view, a snapshot, and a workspace do what their own control does (the sidebar item, the saved view in the sidebar, the snapshot selector, the workspace switcher); a line opens as a line chosen in the search field does; "Export this view" runs the first item of the Export menu, as `Ctrl+E` does; "Save view" opens the Save view popover of the filter bar. A failure is shown where that control shows its own.
- **Lines, waiting:** while the first answer for what is typed is on its way, one skeleton line stands under the Lines heading, and the list is marked as busy. While another is on its way, the line IDs of before stay at `--opacity-stale`.
- **Lines, failed:** the reason in `--text-body` and `--color-danger-text` with the error icon, under the Lines heading, then an item "Try again" that the arrow keys reach like the others.
- **Nothing found:** one line in `--text-body` and `--color-text-secondary`, as tall as an item: "No command matches “…”".
- **Motion:** the scrim fades in over `--duration-slow`; the surface fades in and moves `--space-2` down to its place over `--duration-slow` with `--ease-out`. Both leave at once, so the focus is where the item chosen puts it. Under reduced motion both fade in place.
- **Disabled:** never. An item that cannot run now is left out.

### Shortcut sheet

Every shortcut of the app on one page, for a reader who wants to know the key and not hunt for it. It is the second of the two modals the app has (the other is the command palette). It is drawn from the one list of shortcuts in `shortcuts.ts`, so a shortcut cannot exist without its line here.

- **Opening:** `?` (the character typed, so Shift and `/` on a US layout) opens it as a shortcut of the page: not in a text field, not under a menu, a list, or a popover. The command palette's "Keyboard shortcuts" item, which shows `?`, opens it too. `/` is the neighbor key: it moves the focus to the search field, on the same terms.
- **Closing:** Escape, the Close button, or a press on the scrim closes it, and the focus goes back where it was. While it is open, no other shortcut of the app fires, except `Ctrl+K`, which closes the sheet and opens the command palette, so the two modals never stand over each other.
- **Scrim and surface:** as the command palette's: `--color-scrim` and a surface in `--color-surface-overlay` with a `--border-width-thin` border in `--color-border-default`, corner `--radius-lg`, `--shadow-modal`, at `--z-modal`. `--size-palette-width` wide and never taller than `--size-palette-max-height` nor than the room under its top, which is `--size-palette-offset` below the top of the window; the groups scroll inside it and the title stays.
- **Title:** "Keyboard shortcuts" in `--text-section-title` and `--color-text-primary`, with a quiet Close button at its trailing edge. The dialog is named by the title.
- **Groups:** Go to, Actions, Tables, Panel and dialogs, in that order, each a list under its heading (`--text-caption` in `--color-text-muted`, as tall as a row). A group has no box of its own: the surface is the one container.
- **Row:** at least `--density-row-height` tall, padding `--space-2` at the sides. The label in `--text-body` and `--color-text-primary` at the leading edge, the keys at the trailing edge. Rows are not interactive: they take no focus and no hover.
- **Keys:** each key a key cap, as in the command palette ("Shortcut"): `--text-mono` in `--color-text-muted`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-xs`, `--size-tag-height` tall, the caps `--space-0-5` apart. A cap is a `kbd`. The row reads to assistive technology as its label followed by its shortcut written out ("Control plus 1"), not as separate caps.
- **Motion:** as the command palette's: the scrim fades in over `--duration-slow`, the surface fades in and moves `--space-2` down to its place; both leave at once. Under reduced motion both fade in place.

### Drop zone

- **Shape:** at least `--size-dropzone-min-height` tall, padding `--space-10`, corner `--radius-md`, a `--border-width-thin` dashed border in `--color-border-strong`, no fill.
- **Content:** a title (`--text-section-title`), one sentence (`--text-body`, `--color-text-secondary`), a primary button to choose a file (so the drop zone is never the only way in), and the accepted file types (`--text-caption`, `--color-text-muted`).
- **Hover:** the dashed border becomes `--color-text-secondary`, as a field's border does, and the sentence becomes `--color-text-primary`. The zone takes no fill on hover: it holds a primary button, and a primary button never sits on a hover fill.
- **Focus:** the focus ring on the button inside it.
- **Active (a file is dragged over it):** a `--border-width-thick` dashed border in `--color-accent-text`, fill `--color-accent-subtle`, the title changes to say what dropping will do, and the sentence names the file. The button and the file types are hidden while the file is over the zone: nothing can be pressed during a drag, and a primary button does not sit on the selection tint.
- **Disabled and loading:** while an import runs, the content is replaced by the progress component.
- **Error:** a file that cannot be imported gives a `--border-width-thin` dashed border in `--color-danger-text` and an inline danger notice under the zone that says why and what to do.
- **Window-wide drop:** while a file is dragged anywhere over the window, the window is covered at `--z-drop-target` by one large drop zone in its active state: `--space-2` from the window edges, fill `--color-accent-subtle`, a `--border-width-thick` dashed border in `--color-accent-text`, corner `--radius-md`, and a centered title (`--text-section-title`, `--color-text-primary`) that says what dropping will do. It is opaque and uses no scrim, so its border and its title are checked pairs. The `--space-2` margin around it shows the window as it is, undimmed and unchanged, so the frame reads as a sheet laid over the app. A dashed accent border over `--color-scrim` would fall under 3:1 in the light theme.

### Progress

- **Bar:** a track `--size-progress-height` thick in `--color-border-default` with corner `--radius-full`, which clips a fill in `--color-accent-text` with the same corner. The fill is the accent as ink, not the deep accent of a button: a thin line has to clear 3:1 against its own track as well as against the surface, and it does (7.01 in dark, 4.43 in light, against the track). A progress bar sits on `--color-surface-app`, `--color-surface-panel`, or `--color-surface-field`.
- **Label:** above the bar, what is happening and how far (`--text-body`, `--color-text-primary`), with the count in tabular figures: "Reading rows, 4,200 of 9,300". A bar never appears without a label.
- **Determinate:** the fill is as wide as the track and is moved along it with `transform: translateX()` so that its leading edge marks the reported progress. The transform changes over `--duration-fast` with `--ease-out`. The width of the fill is never animated.
- **Indeterminate:** when no total is known, a segment `--size-progress-segment` wide travels along the track by `transform`, once per `--motion-loop-period` with `--ease-linear`. Under reduced motion the segment rests at the start of the track and the label carries the state.
- **Complete:** the bar is replaced by a success notice or by the next screen. It does not sit at 100 percent.
- **Error:** the bar is removed and an inline danger notice says what happened, why, and how to fix it.

## 6. Do's and Don'ts

### Do:

- **Do** take every color, size, radius, and duration from a token in this file. If a value is missing, add a token here first, then use it.
- **Do** keep teal to the primary action, the current selection, focus, links, and progress. Use `--color-accent-subtle` for selection and `--color-accent` for the one primary button of a region.
- **Do** draw plain data in `--color-chart-neutral`, ramps in the blue of `--hue-ramp`, and several named series in the categorical slots, in slot order.
- **Do** pair every state color with an icon and a label, and every chart series with a text label and a table view.
- **Do** combine only foreground and background tokens that appear together in the contrast pairs table, put a chart mark only on a fill that the fills table says carries marks, and run `node tools/design/check-tokens.mjs` after any change to a token.
- **Do** set line IDs, tags, source IDs, and file names in `--text-mono`, blocker items in the body face, and numbers in columns in tabular figures, right-aligned.
- **Do** show a skeleton on a first load, keep the previous render at `--opacity-stale` on a refetch, and give every empty state a sentence and one action.
- **Do** make every action reachable by keyboard and show the focus ring on `:focus-visible`, inset where an outer ring would be clipped.
- **Do** carry out a destructive action at once and offer "Undo" in a toast.
- **Do** write an error as what happened, why, and how to fix it.
- **Do** keep import review and column mapping as pages.
- **Do** design the light theme from its own tokens: bright paper, dark ink, shadows for what floats.

### Don't:

- **Don't** build "a startup analytics dashboard": no big-number hero tiles with gradient accents, no grid of identical cards each with an icon, a heading, and a paragraph, no sparkline decorating every number.
- **Don't** build "a dark AI tool skin": no purple or violet anywhere in the interface chrome, no glowing gradients, no neon on black, no blurred glass panels. The accent stays teal, and no hue anchor or color moves into the violet, indigo, purple, or magenta range, 270 to 350 degrees.
- **Don't** build "a CAD or control-room console": no safety orange, no hazard stripes, no all-caps monospace labels, no fake instrument panels.
- **Don't** repeat "the old single-file tool": no everything-on-one-page layout, no color that means "this cell is high" without a label, no state that exists only on hover.
- **Don't** build "an enterprise form from 2010": no modal dialog for every step, no confirmation prompt before every action, no toolbar of unlabeled icons.
- **Don't** use a colored side stripe: no `border-left` or `border-right` wider than 1 px as an accent on a card, a row, a list item, or a notice. Use a full hairline border and a tint.
- **Don't** use gradient text, a gradient fill on a tile, or decorative glass (blur or translucency as a style).
- **Don't** nest a bordered container inside another, and don't lay out a grid of identical cards. Stat tiles are cells of one container.
- **Don't** reach for a modal first. A modal is allowed only for the command palette and the shortcut sheet.
- **Don't** add a type size between the four steps, shrink text below 13 px, or change type size with density.
- **Don't** use all-caps labels, letter-spaced small caps, or a display face anywhere.
- **Don't** color a number red or green because it went up or down. Direction is an arrow and a sign.
- **Don't** draw data in teal. A bar, a line, a heatmap cell, or a legend swatch is never an accent color, and no chart color comes within 25 degrees of the accent hue.
- **Don't** give a seventh category a seventh color, recolor a category when a filter changes, re-sort stacked segments or lines by value, or use a status color for a series.
- **Don't** animate layout (a width, a height, a row that expands), animate on page load, loop anything except the spinner and the indeterminate progress bar, or use a bounce or an elastic curve.
- **Don't** make anything available by hover alone, and don't remove the focus ring.
- **Don't** use an em dash in interface text, or the words "OK", "Yes", "Submit", "Oops", or "Welcome back".
- **Don't** put an illustration, a progress bar, a date, a version number, or an apology on a coming soon screen.
