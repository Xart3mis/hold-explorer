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
| `--color-chart-band` | yes | no | The forecast range behind a trend line. |
| `--color-surface-field` | no | no | The inside of a field holds text and icons only. |
| `--color-surface-disabled` | no | no | A disabled control holds its own label only. |
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

Three things are deliberately not in the table:

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
| `--color-text-muted` | `--color-accent-subtle-hover` | 4.5 | text | Captions, units, the Soon tag on hover over a selected element. |
| `--color-accent-text` | `--color-surface-app` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-panel` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-raised` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-overlay` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-hover` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-pressed` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-surface-overlay-hover` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-accent-subtle` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
| `--color-accent-text` | `--color-accent-subtle-hover` | 4.5 | text | Links, the Undo label of a toast, the selected-option check. |
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
| `--font-family-mono` | `"Reddit Mono Variable", "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace` | Line IDs, tags, blocker items, keyboard keys, file names. |
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
| `--font-weight-semibold` | `600` | Titles, stat values, emphasis inside body text. |
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

**The Four Sizes Rule.** There are four sizes: 13, 17, 22, and 28 px, each at least 1.25 times the one below. A size between two steps is forbidden. Body, table, label, and caption share 13 px and are told apart by weight (regular or medium), ink (primary, secondary, or muted), and figure style. Nothing is smaller than 13 px, because the same screen is read at a desk and from across a meeting room.

**The Figures Rule.** Any number that sits in a column (table cells, bar row values, axis ticks, counts in a filter picker) uses tabular figures, `--font-numeric-tabular`, and is right-aligned. A number that stands alone (a stat value, a count in a sentence) uses proportional figures, `--font-numeric-proportional`.

**The Identifier Rule.** A line ID, a tag, or a blocker item is always in `--text-mono`, is never truncated in the middle, never wrapped, and never translated. Text copied from it is the exact source text.

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

Every component a screen of the first desktop version needs is specified here with all its states. Two parts of a chart are not specified yet, on purpose: the heatmap cell and the chart legend. Their colors and rules are fixed in the chart palette above; their anatomy and states are written by the plan that builds the Breakdown matrix and the stacked trends, which will know what they need. They are not forgotten.

### Foundations

**Theme and density selection.** Both are attributes on the root element, and a stylesheet reads nothing else.

- **Theme** is a stored setting with three values: Dark (the default), Light, and System. System follows the operating system and its changes while the app runs. The theme is applied as `data-theme="dark"` or `data-theme="light"` on the root element. System is resolved to one of the two before it is applied, so a stylesheet never sees a third value and needs no media query of its own. The `Dark` column of a token table applies under `data-theme="dark"` and when the attribute is absent; the `Light` column applies under `data-theme="light"`.
- **Density** is `data-density="comfortable"` (the default) or `data-density="compact"` on the root element. A table may override it locally by carrying the attribute itself; the density tokens then take that value for the table and everything inside it.

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
| `--size-tag-height` | `20px` | Height of a tag. |
| `--size-chip-height` | `24px` | Height of a filter chip. |
| `--size-chip-max-width` | `320px` | Widest filter chip. A longer value is cut at the end with an ellipsis. |
| `--size-bar-height` | `8px` | Thickness of the bar in a bar row. |
| `--size-progress-height` | `4px` | Thickness of the progress track. |
| `--size-progress-segment` | `33.333%` | Width of the travelling segment of an indeterminate progress bar, as a share of the track. |
| `--size-bar-label-width` | `180px` | Width of the label column of a bar row group and of a fact list. |
| `--size-menu-min-width` | `180px` | Narrowest menu, when its button is narrower still. |
| `--size-menu-max-width` | `480px` | Widest menu; a longer item is cut at the end with an ellipsis. |
| `--size-stat-tile-min-width` | `160px` | Narrowest stat tile before the row wraps. |
| `--size-dropzone-min-height` | `200px` | Least height of a drop zone. |
| `--size-toast-min-width` | `280px` | Narrowest toast. |
| `--size-toast-max-width` | `480px` | Widest toast. |
| `--size-tooltip-max-width` | `280px` | Widest tooltip; longer text wraps. |
| `--size-popover-width` | `320px` | Width of a popover. It does not change with what the popover holds. |
| `--size-option-list-rows` | `8` | How many rows of an option list show before the list scrolls. |
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
| `--layout-topbar-height` | `48px` | Top bar: app name, workspace switcher, global search, snapshot selector, Import. |
| `--layout-sidebar-width` | `208px` | Sidebar with labeled destinations. |
| `--layout-detail-width` | `400px` | Detail panel for the selected line, hold, or blocker. |
| `--layout-filterbar-height` | `44px` | Filter chip bar under the page header on data screens. |
| `--layout-page-padding-x` | `24px` | Left and right padding of the content area. |
| `--layout-page-padding-y` | `20px` | Top and bottom padding of the content area. |
| `--layout-content-max-width` | `1280px` | Widest Overview and History content. Tables are not capped; they fill the content area. |
| `--layout-form-max-width` | `720px` | Widest form page: Settings, the import review, the mapping step. |
| `--layout-prose-max-width` | `34rem` | Widest running text: about 75 characters at 13 px. |
| `--layout-search-max-width` | `30rem` | Widest global search field. |
| `--layout-breakpoint-wide` | `1280px` | From this window width the detail panel sits beside the content. Below it, the panel overlays the right edge of the content with `--shadow-overlay`. |
| `--layout-window-min-width` | `1024px` | Smallest window width. |
| `--layout-window-min-height` | `640px` | Smallest window height. |

Regions and their surfaces: top bar, sidebar, filter bar, and detail panel are `--color-surface-panel`; the content area is `--color-surface-app`. Regions are separated by a `--border-width-thin` hairline in `--color-border-default`, never by a shadow. The sidebar and the detail panel scroll on their own; the top bar never scrolls. Content is left-aligned; Overview does not center itself in a wide window.

**Page widths.** A page has one of three widths, and what the page is for decides which. A page never picks a width of its own.

- **Form width**, at most `--layout-form-max-width`: a page that is filled in or read from top to bottom. Settings, the welcome page, the import page, the sheet step, the import review, a coming soon screen, and the page for an address that does not exist. Running text inside it is still at most `--layout-prose-max-width` wide.
- **Content width**, at most `--layout-content-max-width`: a page of figures and charts that is read across. Overview and History. Wider than this, bars and tiles stretch until a value sits too far from its label.
- **Full width**, the whole content area: a page whose table is the page. Lines, Breakdown, and Blockers, and any later page that is a table first. A table is never capped: more width shows more columns.
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
- **Disabled:** fill `--color-surface-disabled`, text `--color-text-disabled`, border `--color-border-default` where the variant has one. Not focusable. A disabled button says why in text beside it. A tooltip may repeat the reason for pointer users, but is never the only place it is given.
- **The reasons line:** the form that "says why in text beside it" takes for the primary button of a page, which can wait for several things at once and is the one button the user came to press. Its reasons stand directly under the row of buttons, `--density-stack-gap` below it, one sentence per reason, `--space-1` apart when there are several: `--text-body` in `--color-text-secondary`, at most `--layout-prose-max-width` wide, each naming what is missing and where ("Choose a column for Line ID."). The line is not an error: nothing is wrong yet, so it has no icon and no state color. It sits in a region that is always on the page and is announced politely when what it holds changes, because a disabled button cannot be reached by Tab; the button is described by that region. When the last reason goes, the line goes and the button is enabled in the same moment.
- **Which line says why.** Four cases, one rule each. The primary button of a page that waits for the user to do something has the reasons line above: body text, because it is what to do next. A control that is disabled only until something that is running has ended, such as the chips of the filter bar during a snapshot switch, has one sentence of `--text-caption` in `--color-text-muted` after the controls: it reports a state that will pass and asks for nothing. A control that waits for another control (the state below) has no line at all, because the control with the spinner says what is running. A control that is not the primary button of its page and is disabled for a reason the user can do something about, such as a group of choices that needs a value chosen first, has its reason in text beside it: one sentence of `--text-caption` in `--color-text-muted`, naming what to do. It is quieter than the reasons line because the control is not what the page waits for.
- **Loading:** the label stays, the leading icon becomes the spinner (`--size-icon`, one turn per `--motion-loop-period`), the button keeps its colors, ignores presses, and has `aria-busy`. The width does not change: a button without an icon that can become pending keeps the room of the spinner free at rest, half on each side of its label. That room is asked for where the button is built and is not a side effect of anything else, so a button that never waits is no wider than its label needs.
- **Waiting for another control:** an action shows its spinner on the control that started it, and on no other. While it runs, a control that would start a conflicting action, such as the snapshot selector while another workspace is being opened, is inert: it keeps its colors, its icon, its width, and its place in the Tab order, takes no hover or pressed fill, ignores presses, and has `aria-busy`. It shows no spinner and keeps the look of an enabled control. To assistive technology it is announced as unavailable and busy (`aria-disabled` and `aria-busy`), which is what it is for the moment. It needs no reason beside it: the one control with the spinner says what is running. A button that opens a menu follows the same rule and keeps its chevron.
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

### Menu

A button that opens a short list of actions, or of choices, under itself: the workspace switcher, the snapshot selector. A menu holds things to do or to switch to. A value that belongs to a form is a select.

- **Button:** a quiet button with a chevron. Height `--density-control-height`, padding `--space-3` at the leading side and `--space-2` at the trailing side, corner `--radius-sm`, text `--text-label` in `--color-text-secondary`. An optional leading icon, the label, and a chevron at `--size-icon` in `--color-text-muted`, `--space-1-5` apart. The label is the current value ("Unit 573 piping") or the name of what the menu holds. A long label is cut at the end with an ellipsis; the button never grows past the room it is given, and its accessible name is always the full label.
- **Hover:** fill `--color-surface-hover`, text `--color-text-primary`.
- **Active and open:** fill `--color-surface-pressed` and text `--color-text-primary`, while the button is pressed and for as long as its menu is open. The button has `aria-expanded="true"` while it is open.
- **Focus:** the focus ring.
- **Loading:** while the action the menu started runs, the spinner takes the place of the chevron, the button keeps its colors and its width, opens nothing, and has `aria-busy`.
- **Waiting for another control:** as for a button: no spinner, the chevron kept, no hover or pressed fill, opens nothing, `aria-disabled` and `aria-busy`.
- **Disabled:** a menu button is never disabled. A menu with nothing to offer is not shown, and one that has to wait is in one of the two states above.
- **Menu:** fill `--color-surface-overlay`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-md`, `--shadow-overlay`, padding `--space-1`, at `--z-dropdown`. It opens under the button, `--space-1` away, lined up with the leading edge of the button, or with its trailing edge for a button at the trailing side of the window, and above the button where there is no room below. It is as wide as its longest item, never narrower than its button or than `--size-menu-min-width`, and never wider than `--size-menu-max-width`. A menu that is taller than the room it has scrolls inside itself.
- **Opening:** it fades in and moves `--space-1` toward its place over `--duration-base`, and leaves by fading over `--duration-fast`: nothing moves while it goes. Under reduced motion it fades in place.
- **Item:** at least `--density-row-height` tall, horizontal padding `--space-2`, corner `--radius-sm`, the label in `--text-body` and `--color-text-primary`, on one line. An item may carry a detail after its label, `--space-4` away at the trailing side: `--text-caption` in `--color-text-muted`, with tabular figures ("9,241 holds"). The detail describes the item to assistive technology; it is not part of its name. An action is named by a verb, a choice by its name.
- **Highlighted:** by the pointer or by the arrow keys, fill `--color-surface-overlay-hover`. The item the keyboard is on also shows the focus ring, inset. An item the pointer is on shows the fill only, so the ring does not follow the pointer down the menu.
- **Active (pressed):** the highlighted fill stays; the menu closes on release.
- **Chosen:** in a section that holds a choice, the chosen item is written in `--font-weight-medium` and carries a check icon in `--color-accent-text` at its trailing edge. Every item of that section keeps the room of the check, so the details line up. The items are announced as a set of which one is checked.
- **Disabled item:** label and detail in `--color-text-disabled`; the arrow keys pass it by.
- **Section:** a group of items under its name. The name is a line of `--text-caption` in `--color-text-muted`, as tall as an item and lined up with the labels.
- **Separator:** a `--border-width-thin` line in `--color-border-default` from edge to edge of the menu, with `--space-1` above and below. It is the default border and not the subtle one, which has the lightness of the overlay surface itself in the dark theme.
- **Behavior:** Enter, Space, or the down arrow opens the menu. The arrow keys move, Home and End jump to the ends, typing jumps to a match, Enter or Space chooses and closes. Esc, or a press outside, closes without choosing. Closing gives the focus back to the button.
- **Error:** a menu has no error state of its own. What an item started and failed is shown where the error rule of "Where an error goes" puts it.

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
- **Height:** one of two, and the page decides which. A table that is the page (Lines, Breakdown, Blockers) fills the height it is given and scrolls inside it. A table in the flow of a page is as tall as its rows up to a number of them, twelve unless the page says otherwise, and scrolls inside itself past that; a table that is read whole, such as a group of Overview, has no such limit and the page scrolls.
- **Header row:** stays at the top of the table at `--z-sticky`, height `--density-header-height`, fill `--color-surface-raised`, bottom hairline in `--color-border-default`, text `--text-label` in `--color-text-secondary`. A sortable header is a button; the sorted column's header is `--color-text-primary` with an arrow icon. Once rows scroll beneath it, the header gains `--shadow-raised`.
- **Row:** height `--density-row-height`, cell padding `--density-cell-padding-x`, bottom hairline in `--color-border-subtle`, text `--text-table` in `--color-text-primary`. Supporting columns use `--color-text-secondary`. Numbers are right-aligned with tabular figures. Line IDs use `--text-mono`. One line per row; long text is cut at the end with an ellipsis and shown in full in the detail panel. The whole text stays in the cell for assistive technology, so nothing depends on a tooltip.
- **Column widths:** declared by the page, never measured from what the cells hold, because only the rows near the visible part exist. A column has one of two sizes. A number of characters: the column is that many figures of its typeface wide, plus the cell padding at both sides; a figure is the widest character of the table face and every figure is as wide as the next, so a column of numbers is declared by its longest number, and in the monospace face every character is one. Or a share: the column takes its share of the width the other columns leave, and is never narrower than a number of characters it declares. The width of a figure is measured in each of the two faces once the fonts are there, so the widths follow the fonts, the root size, and the density.
  - A column is never narrower than its header needs, with the arrow where the header can be sorted. A header is never cut.
  - An identifier is never cut: its column is declared from the widest value of the whole result, which the command sends with the rows.
  - A column of running text is declared by a count of its text in which a figure counts in full and any other character as 0.85 of one, since letters are narrower than figures. Text that is longer is cut with the ellipsis.
  - One column takes a share wherever the table may be wider than its columns, so the last column reaches the edge. The hairlines run the width of the table either way.
- **Sideways scroll:** when the columns need more than the table is wide, no column gives way: the table scrolls sideways. The column that names the row, the first one, is pinned: it stays in view over the columns that scroll beneath it, in the header as well, and carries the fill of its row. Once the table is scrolled sideways, a `--border-width-thin` line in `--color-border-default` marks the edge of the pinned column. It is a hairline and not a shadow.
- **Rows load as the table is scrolled.** A long result arrives a page at a time. When the last row that is loaded comes within the height of the visible part, the table asks for the next page: once for each time the end comes near, and again only after rows were added, so a page that brings nothing is not asked for twice. Only the rows near the visible part are in the document; the row that has the focus stays in it while it is scrolled away, so the focus is never lost to the page. When the rows are replaced by other rows, as after another filter or sort, the table returns to its top.
- **Load-more row:** while a page is on its way, one row of skeleton lines stands under the last row, at the row height, with the same hairline. It is a picture and not a row: it takes no focus and the arrow keys stop at the last row above it.
- **Count line:** under a table that shows a part of a longer result, outside what scrolls: how many rows are loaded and how many there are, in the page's own words and with formatted numbers ("200 of 3,612 lines"). `--text-caption` in `--color-text-muted` with tabular figures, padding `--space-2` above and below and `--density-cell-padding-x` at the sides, so it starts where the first column does. Under a table that fills its page a hairline in `--color-border-default` stands between the rows and the line. While a page is on its way the line keeps the count and adds "Loading more rows" after it, `--space-2` away; the count does not move. The line is a status region, so both are announced politely, and it describes the table. A table that shows all of its rows has no visible count line; its count is still announced.
- **Hover:** fill `--color-surface-hover`.
- **Selected row:** fill `--color-accent-subtle`, hover `--color-accent-subtle-hover`, `aria-selected`. Selection is a tint across the whole row. It is never a stripe on one edge.
- **Focus:** the inset focus ring on the row or cell. Arrow keys move it by a row, Page Up and Page Down by the height of the visible part, Home and End to the first and the last row that is loaded; Enter opens the detail panel; Esc closes the panel and returns focus to the row. A row that takes the focus is scrolled clear of the header and of the pinned column.
- **Active:** fill `--color-surface-pressed` while pressed.
- **Disabled:** a table has no disabled rows. A column that needs data the snapshot lacks is hidden, and the page says which column of the export it needs.
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

### Stat tile

A row of figures, not a row of cards.

- **Group:** one container on `--color-surface-raised` with a `--border-width-thin` border in `--color-border-default` and corner `--radius-md`. The tiles are cells of that one container, divided by vertical hairlines in `--color-border-subtle`. Cells are at least `--size-stat-tile-min-width` wide and share the row equally.
- **Tile:** padding `--space-4`. A label on top (`--text-label`, `--color-text-secondary`), a `--space-1` gap, the value (`--text-stat`, `--color-text-primary`, proportional figures), and, when a previous snapshot exists, a delta line (`--text-caption`, `--color-text-secondary`): an arrow icon, the signed change, and "since previous snapshot" in `--color-text-muted`.
- **The delta is not colored.** Whether more or fewer is good depends on the figure, so direction is shown by the arrow and the sign.
- **Interaction:** each tile is a button that opens the filtered screen behind its number. Hover fill `--color-surface-hover`. Active fill `--color-surface-pressed`. Focus: the inset focus ring.
- **Disabled:** a figure the snapshot cannot provide shows a dash in `--color-text-disabled` and a caption naming the missing column.
- **Loading:** a skeleton block in place of the value; the label stays.
- **Error:** the group is replaced by one inline danger notice.
- **Forbidden:** a gradient, an icon per tile, a sparkline behind the number, an accent-colored value.

### Bar row

A horizontal bar per category: bars by discipline, hold type, role; top blockers.

- **Row:** height `--density-bar-row-height`, three columns: the label (`--text-body`, `--color-text-primary`, `--size-bar-label-width` wide, cut at the end with an ellipsis), the bar, and the value (`--text-table`, right-aligned, tabular figures) with an optional second value in `--color-text-muted`.
- **Bar:** thickness `--size-bar-height`, fill `--color-chart-neutral`, corner `--radius-xs`, growing from the left edge of its column. No track behind it. Every bar in a group has the same neutral color; length carries the value. The bar is never teal and never a categorical color.
- **Age bands:** the one group with a color. Its categories have an order, so each bar takes the ordinal step of its band (`--color-chart-ord-1` to `--color-chart-ord-5`) and the rows stay in band order. An ordinal bar keeps its step in every state; only the row fill changes.
- **Group:** rows are separated by space, not hairlines, and sorted by value unless the dimension has an order of its own.
- **Interaction:** the whole row is a button that filters by its category, with `aria-pressed`.
- **Static:** on a screen that cannot filter by a category, a row only shows it. It is then not a button: it takes no focus and has no hover, pressed, or selected look, so nothing on it says that it can be pressed. A row is one or the other for good: a row that can be pressed always has an action, and a static row never has one.
- **To assistive technology** a group is a named list, and each row is an item of it that reads its label and then its values. A pressable row is a button inside its item.
- **Hover:** row fill `--color-surface-hover`, bar `--color-chart-neutral-hover`.
- **Active (pressed):** row fill `--color-surface-pressed`, bar `--color-chart-neutral-hover`.
- **In the active filter:** row fill `--color-accent-subtle`, bar `--color-chart-neutral-selected`. The teal tint says the row is selected; the bar stays neutral and takes its strongest step. Hover on such a row: fill `--color-accent-subtle-hover`, bar unchanged.
- **Focus:** the inset focus ring.
- **Disabled:** not applicable.
- **Loading:** skeleton rows with bars of varied length. A refetch keeps the previous rows at `--opacity-stale`.
- **Error:** one inline danger notice in place of the group.

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
- **Tones:** danger for an action that failed (announced at once), warning for something the user should know before going on, info for a standing fact. Success is never a shell notice: a confirmation is a toast.
- **Staying:** it stays across pages. Opening another destination does not remove it, because the user may not have read it yet and the page it is about may be gone.
- **Leaving:** each has a close button and goes when that is pressed. The notice that an older snapshot is in view has none: it is a state, not a message, and goes when the newest snapshot is selected, which its one action, a quiet button, does.
- **What belongs here** is set by "Where an error goes": what outlives the page it started on. A failure the page can still show stays on the page, beside what failed.
- **States:** those of the inline notice. Its buttons have their own states; the action of a shell notice follows the pending rule of every button.

### Toast

A short confirmation that floats, then leaves. The home of Undo.

- **Position:** the bottom left of the content area, `--space-6` from its edges, at `--z-toast`. At most three are stacked, newest at the bottom, `--space-2` apart.
- **A fourth toast** pushes out the oldest toast that offers no action. A toast that carries Undo is never pushed out: it leaves when its time is up, when it is closed, or when its action is taken. When every toast on screen carries one, nothing is pushed out and the stack is taller than three for the seconds that takes; an undo that disappears early cannot be had back, and a stack of four can.
- **Shape:** fill `--color-surface-overlay`, `--border-width-thin` border in `--color-border-default`, corner `--radius-lg`, `--shadow-overlay`, padding `--space-3`, between `--size-toast-min-width` and `--size-toast-max-width` wide.
- **Anatomy:** an optional state icon, the message (`--text-body`, `--color-text-primary`) saying what was done, an action, and a close button. The action is a quiet button whose label is `--color-accent-text`, for example "Undo". Hover fill `--color-surface-overlay-hover`.
- **Undo:** a destructive action is carried out at once and its toast offers "Undo". `Ctrl+Z` triggers the Undo of the newest toast. There is no confirmation prompt.
- **Timing:** stays for `--timeout-toast`; the timer pauses while the toast is hovered or holds focus. It enters by fading in and rising `--space-2` over `--duration-base` and leaves by fading over `--duration-fast`.
- **Focus:** a toast never takes focus when it appears. It is announced politely, and its buttons are reachable by Tab and show the focus ring. Toasts are reached in the order they appeared, oldest first, after the page.
- **When a toast that holds the focus goes**, the focus is not dropped. It moves to the toast that came after it, or, when that was the last one, to the toast before it. The toast itself takes it, and shows the focus ring, not one of its buttons: a second press of the same key must not trigger the Undo of another toast. When no toast is left, the focus goes back to where it was before it entered the toasts.
- **Error:** a failure that needs reading is an inline notice, not a toast.

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
- **Filtered to nothing:** when filters hide every row, the title says so and the action is "Clear all".

### Coming soon screen

A destination that is not built yet opens a screen made of the page header and the empty state, both unchanged, inside the normal shell. It is a complete page, not a placeholder.

- **Page header:** the destination's name as the page title (`--text-page-title`), for example "Blockers". No description line and no page actions, and no breadcrumb, as for every destination.
- **Empty state title:** shown, as in every empty state (`--text-section-title`, `--color-text-primary`). It says what is absent: "Not available in this version". The page title names the destination and this title states its status. They are two different statements, so the screen has both.
- **Empty state body:** one or two sentences on what the destination will show, in the empty state's own style (`--text-body`, `--color-text-secondary`, at most `--layout-prose-max-width` wide). The body is secondary ink here as in every empty state. The one statement the user must not miss, that the destination is not available, is therefore the title and not a line of body text.
- **Action:** one secondary button, "Go to Overview".
- **Placement:** that of an empty state on an otherwise empty page, `--space-12` below the page header.
- **Forbidden:** an illustration, a progress bar, a date, a version number, an apology, a sign-up, and the accent color.

### Page header

- **Anatomy:** on a page below a destination, a breadcrumb as the first line (see "Breadcrumb"); then the page title (`--text-page-title`, `--color-text-primary`) on the left, with an optional one-line description under it (`--text-body`, `--color-text-secondary`); page actions as buttons on the right, level with the title. Tabs or the filter bar, when the page has them, sit directly under the header.
- **Spacing:** the header starts at the content padding (`--layout-page-padding-x`, `--layout-page-padding-y`) and is followed by a `--space-4` gap. A `--space-2` gap separates the breadcrumb from the title. The header has no border and no background of its own.
- **Rules:** one page title per page, and it names the destination or the step ("Lines", "Review import"). No icon beside it. A destination has no breadcrumb above its title; a page below a destination has one.
- **Loading:** the title and the breadcrumb are known before the data is and never show a skeleton.

### Breadcrumb

The way back up from a page that lies below a destination. It is part of the page header and sits above the page title.

- **When:** only on a page below one of the nine destinations. The pages of the import flow are such pages: "Import", then "Map columns"; "Import", then "Review". A destination itself (Overview, Breakdown, Lines, Blockers, History, People, Follow-up, Rules, Settings) has no ancestor and shows no breadcrumb, because a trail of one item would only repeat the title. The workspace is not part of the trail: the top bar already names it.
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
- **Identifier:** a line ID, a tag, a blocker item, or a file name is in `--text-mono` and can be selected and copied as the exact source text. A line ID fits on one line in every place the list is used. A file name can have any length, so it breaks where the row ends instead of being cut.
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

### Sidebar item

The sidebar lists all nine destinations in two groups: Overview, Breakdown, Lines, Blockers, History, People, Follow-up; then, set apart at the bottom of the sidebar above a hairline in `--color-border-subtle`, Rules and Settings.

- **Shape:** height `--density-nav-item-height`, horizontal padding `--space-2`, corner `--radius-sm`, an icon at `--size-icon` in the label's color with a `--space-2` gap, the label in `--text-label`. Items are `--space-0-5` apart inside a sidebar padded by `--space-2`.
- **Default:** transparent fill, label `--color-text-secondary`.
- **Hover:** fill `--color-surface-hover`, label `--color-text-primary`.
- **Active:** fill `--color-surface-pressed`.
- **Current:** fill `--color-accent-subtle`, label `--color-text-primary`, `aria-current="page"`. Hover on the current item: `--color-accent-subtle-hover`.
- **Focus:** the inset focus ring. `Ctrl+1` to `Ctrl+7` open the first seven destinations.
- **Disabled:** never. Every destination can be opened, including one that is not built yet.
- **Soon tag:** a destination that is not built yet shows a tag reading "Soon" after its label: next in reading order, and aligned to the trailing edge of the item so the tags form one quiet column. The tag text is part of the item's accessible name. The tag is the neutral tag below: `--size-tag-height` tall, text `--text-caption` in `--color-text-muted`, a `--border-width-thin` border in `--color-border-default`, no fill, no accent, no state color. The item keeps every state above; the tag does not change with them. `--color-text-muted` clears 4.5:1 on each fill the item can have.

### Tag

A small, non-interactive label on a row or an item.

- **Shape:** height `--size-tag-height`, horizontal padding `--space-1-5`, corner `--radius-sm`, text `--text-caption`. One line, never wrapped and never cut: a tag holds a word or two.
- **Neutral:** text `--color-text-muted`, `--border-width-thin` border in `--color-border-default`, no fill. Used for "Soon" and for plain facts such as "Limited".
- **State:** fill, border, and text from one state (for example `--color-warning-subtle`, `--color-warning-border`, `--color-warning-text`), always with an icon at the leading edge. The four states are info, warning, danger, and success.
- **Icon:** at `--size-icon`, in the color of the text, `--space-1` before it. A state tag cannot be built without one; a neutral tag may have one and usually has none. The icon is decoration to assistive technology: the text of the tag says what it means.
- **States:** none. A tag is not interactive: it takes no focus and has no hover, active, disabled, loading, or error state, and it keeps its look in every state of the row or the item it sits on. Its text is part of what that row or item reads to assistive technology.

### Filter chip

- **Shape:** height `--size-chip-height`, horizontal padding `--space-2`, corner `--radius-full`, text `--text-label`. Chips are the only pills in the interface: round means a filter that can be removed. A chip that carries a remove button has no padding at its trailing side: the circle of the button ends the pill, and stands `--space-1` after the value. A disabled chip, which has no remove button, and the add-filter chip have `--space-2` at both sides.
- **Active filter:** fill `--color-accent-subtle`, `--border-width-thin` border in `--color-accent-border`, the field name in `--color-text-secondary` and the value in `--color-text-primary`, and a remove button at the trailing edge. Hover `--color-accent-subtle-hover`.
- **Two controls in one pill.** The field name and the value are one button, which opens the filter to change it. The remove button is a second one: a circle as tall as the chip inside its border, with an X at `--size-icon` in `--color-text-secondary`, `--space-1` after the value. Its accessible name says which filter it removes, and it has a tooltip, as every icon-only button has.
- **A negated filter** reads the field name, then "is not" and the value. "Is not" is written in the ink of the value, `--color-text-primary`, so the negation is read with the value it turns around and cannot be skipped as part of the label.
- **A long value** is cut at the end with an ellipsis: a chip is at most `--size-chip-max-width` wide. The accessible name of the chip is always the full text, and the picker it opens lists every value.
- **Active (pressed):** fill `--color-accent-subtle-hover`, as on hover. The chip keeps that fill for as long as its picker is open.
- **Remove button:** hover and pressed give the circle the fill `--color-accent-subtle-hover`, a `--border-width-thin` hairline in `--color-accent-border` around it, and the X the ink `--color-text-primary`, while the rest of the chip keeps its fill at rest, so it is clear which of the two controls the pointer is on. The hairline is what still reads when the chip already has that fill, as it has for as long as its picker is open: the fill then changes nothing, and the hairline and the ink mark the circle. Its focus ring is inset, so it is not taken for the ring of the chip.
- **Add filter:** a quiet button in the same pill shape with a `--border-width-thin` border in `--color-border-strong`. A plus icon at `--size-icon`, a `--space-1` gap, and its label, in `--color-text-secondary`. Hover: fill `--color-surface-hover`, text `--color-text-primary`. Active, and while its picker is open: fill `--color-surface-pressed`.
- **Disabled:** while the filters cannot be changed (an import is running, or the snapshot is being switched), every chip has fill `--color-surface-disabled`, a border in `--color-border-default`, text in `--color-text-disabled`, and no remove button. Disabled chips are not focusable, and a line of `--text-caption` in `--color-text-muted` after the chips says why.
- **Loading:** a chip has no loading state of its own. A filter applies at once: the chip appears in its final look, and the content it filters keeps its previous render at `--opacity-stale` until the new rows arrive. While the add-filter picker reads its values, the picker shows the spinner (`--size-icon`) beside a label in `--text-caption`.
- **Error:** a chip has no error state. A filter that could not be applied is said by an inline notice above the content it filters.
- **Focus:** the focus ring on the chip and on its remove button separately. Backspace on a focused chip removes it, and so does Delete, whichever of its two controls has the focus.
- **Clear all:** a quiet button at the end of the row, always visible while any filter is active.
- **Transitions:** fill, border, and text color over `--duration-fast` with `--ease-out`.

### Popover

A small surface that opens from a control and holds controls of its own: the filter picker. It is what a menu is for a list of items, for anything that is more than a list.

- **Surface:** that of a menu: fill `--color-surface-overlay`, a `--border-width-thin` border in `--color-border-default`, corner `--radius-md`, `--shadow-overlay`, at `--z-dropdown`. Padding `--space-3`; its parts are `--density-stack-gap` apart.
- **Size:** `--size-popover-width` wide, whatever it holds, so it does not change width while a list inside it is read again. It is never taller than the room between its control and the edge of the window. When it holds more than fits, the list inside it scrolls and the popover does not.
- **Placement:** under the control that opened it, `--space-1` away, leading edges lined up. Where there is no room below it opens above, and where there is none at the trailing side it lines up with the trailing edge.
- **Opening:** as a menu: it fades in and moves `--space-1` toward its place over `--duration-base`, leaves by fading over `--duration-fast`, and fades in place under reduced motion.
- **The control that opened it** keeps its pressed look and has `aria-expanded="true"` for as long as the popover is open.
- **Focus:** opening moves the focus into the popover: to the first field it holds, such as a search field, because a popover with a field is opened to type in it, and otherwise to the popover itself, which then shows the inset focus ring. Tab moves through the controls inside and stays inside. Esc, or a press outside, closes it, and closing gives the focus back to the control that opened it.
- **No scrim:** nothing is laid over the page. It stays as it is behind the popover, undimmed, and what the popover changes shows there at once. The page cannot be reached while the popover is open (Tab stays inside, and a press outside closes it), which is what a menu does as well.
- **What it may hold:** fields, a choice group, an option list, quiet buttons, and text. A quiet button inside takes the hover fill `--color-surface-overlay-hover`. It never holds a primary button: an overlay does not carry one (the Two Surfaces Rule), and a popover has nothing to confirm, because what is chosen in it applies at once.
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
- **Focus:** the list is one stop in the Tab order. The arrow keys move through the options, Home and End jump to the ends, typing jumps to a match, and Space or Enter ticks and unticks the option the keyboard is on. That option shows the inset focus ring; an option the pointer is on shows the fill only.
- **A count of zero:** label and count in `--color-text-muted`. The option can still be chosen, so a value that was ticked before and no longer matches anything can be unticked.
- **Empty:** one line in `--text-caption` and `--color-text-muted`, as tall as an option, that says what is absent ("No value matches"). It is never left blank. With no option to carry the focus, the list itself is the stop for Tab, and shows the inset focus ring while the keyboard is on it.
- **Loading, first read:** the spinner at `--size-icon` and a label in `--text-caption` and `--color-text-muted` beside it, in place of the options. The list is marked as busy. As when it is empty, the list is the stop for Tab and shows the inset focus ring itself.
- **Loading, a re-read:** the counts stay at `--opacity-stale` until the new ones arrive, and the list is marked as busy meanwhile. Only the counts are dimmed, because only they are being read again: labels and marks keep their ink, so every option, one written in the muted ink included, stays readable for as long as it can be ticked.
- **Disabled:** not applicable. A value that cannot be chosen is not listed, and while nothing can be changed the control that opens the list is disabled.
- **Error:** an inline danger notice in the place of the list, shown by the screen that reads the values.
- **Footer:** an optional line under the list that does not scroll with it, in `--text-caption` and `--color-text-muted`, with the horizontal padding of an option. It says what the list leaves out: "1,300 more values. Type to narrow."
- **No search field of its own.** Where a list can be longer than what is shown, a text field above it narrows it. The field is a part of what holds the list, not of the list.

**The filter picker, composed.** A popover that holds, from top to bottom and in Tab order:

1. A text field that narrows the values, with a visible label that names the field being filtered. It takes the focus when the popover opens.
2. A choice group in a row: "Is" and "Is not". It applies to the whole field.
3. The option list of the values, with several values to choose and the count each would keep. The list is pulled out by `--space-2` at both sides, so the fill of a highlighted option stops `--space-1` from the edge of the popover, as an item of a menu does, and the labels of the options start on the same line as the field above.
4. The footer of the list, when more values exist than are listed.

A ticked value applies at once and the popover stays open. The counts are then read again: they are dimmed until the new ones arrive, and the options stay as they are. Nothing in the picker is a button to confirm.

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
- **Do** set line IDs, tags, and blocker items in `--text-mono`, and numbers in columns in tabular figures, right-aligned.
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
