# Palette validation

The record of how the chart colors in `DESIGN.md` were checked. Two tools were used:

- `node tools/design/check-tokens.mjs`, in this repository. It enforces every claim `DESIGN.md` makes about the chart colors and runs without anything else installed.
- `validate_palette.js`, the palette validator of the data visualization skill (written `<dataviz skill>/scripts/validate_palette.js` below). It is not in this repository. It is the independent check: the checker's color-blind simulation and distances were written to match it, and the numbers below agree with the checker's to one decimal.

Run on 2026-10-11 against the token values of that day. Distances are Euclidean in OKLab, times 100. Color blindness is simulated for protanopia and deuteranopia with the model of Machado, Oliveira and Fernandes (2009) at full severity; the smaller of the two distances counts.

## How to repeat

```
node tools/design/check-tokens.mjs
node tools/design/check-tokens.mjs --orders
node tools/design/check-tokens.mjs --hex <dark|light> <tokens of the set>
node <dataviz skill>/scripts/validate_palette.js "<hex list>" --mode <dark|light> --surface "<hex of the surface>" [--pairs all] [--ordinal]
```

The third command prints the hex list and the surface hex that the fourth takes. Each set below names its tokens and its flags. Every set was run in both themes against the two surfaces a chart is drawn on, `--color-surface-app` and `--color-surface-panel`. The validator checks contrast against that one surface only; contrast against every fill a mark can sit on is the checker's job.

## Summary

| Set | Dark, app | Dark, panel | Light, app | Light, panel | Meaning |
|---|---|---|---|---|---|
| Categorical, six slots, neighbours in slot order | pass | pass | pass | pass | Claimed, holds. |
| Categorical, slots 1 to 3, every pair | pass | pass | pass | pass | Claimed, holds. |
| Categorical, six slots, every pair (not a claim) | exit 1: CVD separation, Normal-vision floor | exit 1: CVD separation, Normal-vision floor | exit 1: CVD separation, Normal-vision floor | exit 1: CVD separation, Normal-vision floor | Not claimed. Expected. |
| Ordinal ramp, five steps | pass | pass | pass | pass | Claimed, holds. |
| Sequential ramp, seven steps, run in the ordinal mode | exit 1: Light-end contrast | exit 1: Light-end contrast | exit 1: Light-end contrast | exit 1: Light-end contrast | The one failing check does not apply to a sequential ramp. |
| Status marks, every pair | exit 1: Lightness band | exit 1: Lightness band | pass, with a WARN | pass, with a WARN | The band does not apply to status marks. The WARN is covered by icon and label. |

The neutral data marks (`--color-chart-neutral` and its two steps) are not a palette of hues and were not run through the validator: a gray fails its chroma floor by definition. Their one color requirement is contrast, which the checker enforces on every fill.

## Results per set

Output is quoted from the validator with its arrows, dashes, and delta signs written as words. Each line is: result, check, detail.

### Categorical, six slots, neighbours in slot order

Tokens: `--color-chart-1 --color-chart-2 --color-chart-3 --color-chart-4 --color-chart-5 --color-chart-6`.

**Claim: holds.** Stacked marks and lines are drawn in slot order, so only neighbouring slots touch. Enforced by the checker ("Chart series", neighbouring slots).

```
$ node <dataviz skill>/scripts/validate_palette.js "#5a8ff3,#0c996f,#cd6722,#188db9,#c75f7b,#989a37" --mode dark --surface "#0b1011"
  PASS  Lightness band       all 6 inside L 0.48 to 0.67
  PASS  Chroma floor         all 6 >= 0.1
  PASS  CVD separation       worst adjacent #989a37 and #c75f7b distance 9.9 (deutan) ; tritan 6.2
  PASS  Normal-vision floor  worst adjacent #989a37 and #c75f7b distance 20.9 (normal)
  PASS  Contrast vs surface  all 6 >= 3:1
  exit code 0  (dark, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#5a8ff3,#0c996f,#cd6722,#188db9,#c75f7b,#989a37" --mode dark --surface "#111718"
  PASS  Lightness band       all 6 inside L 0.48 to 0.67
  PASS  Chroma floor         all 6 >= 0.1
  PASS  CVD separation       worst adjacent #989a37 and #c75f7b distance 9.9 (deutan) ; tritan 6.2
  PASS  Normal-vision floor  worst adjacent #989a37 and #c75f7b distance 20.9 (normal)
  PASS  Contrast vs surface  all 6 >= 3:1
  exit code 0  (dark, --color-surface-panel)

$ node <dataviz skill>/scripts/validate_palette.js "#345fb2,#1d916a,#a75217,#0d89b4,#862c48,#667015" --mode light --surface "#f8fbfb"
  PASS  Lightness band       all 6 inside L 0.43 to 0.77
  PASS  Chroma floor         all 6 >= 0.1
  PASS  CVD separation       worst adjacent #a75217 and #1d916a distance 9.2 (deutan) ; tritan 9.4
  PASS  Normal-vision floor  worst adjacent #1d916a and #345fb2 distance 21.1 (normal)
  PASS  Contrast vs surface  all 6 >= 3:1
  exit code 0  (light, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#345fb2,#1d916a,#a75217,#0d89b4,#862c48,#667015" --mode light --surface "#eef4f4"
  PASS  Lightness band       all 6 inside L 0.43 to 0.77
  PASS  Chroma floor         all 6 >= 0.1
  PASS  CVD separation       worst adjacent #a75217 and #1d916a distance 9.2 (deutan) ; tritan 9.4
  PASS  Normal-vision floor  worst adjacent #1d916a and #345fb2 distance 21.1 (normal)
  PASS  Contrast vs surface  all 6 >= 3:1
  exit code 0  (light, --color-surface-panel)
```

### Categorical, slots 1 to 3, every pair

Tokens: `--color-chart-1 --color-chart-2 --color-chart-3`. Flags: `--pairs all`.

**Claim: holds.** The first three slots can be used where any two marks can touch. Enforced by the checker ("Chart series", slots 1 to 3, every pair).

```
$ node <dataviz skill>/scripts/validate_palette.js "#5a8ff3,#0c996f,#cd6722" --mode dark --surface "#0b1011" --pairs all
  PASS  Lightness band       all 3 inside L 0.48 to 0.67
  PASS  Chroma floor         all 3 >= 0.1
  PASS  CVD separation       worst all-pairs #cd6722 and #0c996f distance 10.3 (protan) ; tritan 6.2
  PASS  Normal-vision floor  worst all-pairs #0c996f and #5a8ff3 distance 22.1 (normal)
  PASS  Contrast vs surface  all 3 >= 3:1
  exit code 0  (dark, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#5a8ff3,#0c996f,#cd6722" --mode dark --surface "#111718" --pairs all
  PASS  Lightness band       all 3 inside L 0.48 to 0.67
  PASS  Chroma floor         all 3 >= 0.1
  PASS  CVD separation       worst all-pairs #cd6722 and #0c996f distance 10.3 (protan) ; tritan 6.2
  PASS  Normal-vision floor  worst all-pairs #0c996f and #5a8ff3 distance 22.1 (normal)
  PASS  Contrast vs surface  all 3 >= 3:1
  exit code 0  (dark, --color-surface-panel)

$ node <dataviz skill>/scripts/validate_palette.js "#345fb2,#1d916a,#a75217" --mode light --surface "#f8fbfb" --pairs all
  PASS  Lightness band       all 3 inside L 0.43 to 0.77
  PASS  Chroma floor         all 3 >= 0.1
  PASS  CVD separation       worst all-pairs #a75217 and #1d916a distance 9.2 (deutan) ; tritan 9.4
  PASS  Normal-vision floor  worst all-pairs #1d916a and #345fb2 distance 21.1 (normal)
  PASS  Contrast vs surface  all 3 >= 3:1
  exit code 0  (light, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#345fb2,#1d916a,#a75217" --mode light --surface "#eef4f4" --pairs all
  PASS  Lightness band       all 3 inside L 0.43 to 0.77
  PASS  Chroma floor         all 3 >= 0.1
  PASS  CVD separation       worst all-pairs #a75217 and #1d916a distance 9.2 (deutan) ; tritan 9.4
  PASS  Normal-vision floor  worst all-pairs #1d916a and #345fb2 distance 21.1 (normal)
  PASS  Contrast vs surface  all 3 >= 3:1
  exit code 0  (light, --color-surface-panel)
```

### Categorical, six slots, every pair (not a claim)

Tokens: `--color-chart-1 --color-chart-2 --color-chart-3 --color-chart-4 --color-chart-5 --color-chart-6`. Flags: `--pairs all`.

**Not a claim. Expected to fail,** as the method says any six or more hues will: the list of pairs no longer depends on the order. `DESIGN.md` states the consequence: where any two marks can touch, every mark carries its label. Recorded so that nobody reads the passing runs above as covering this case.

```
$ node <dataviz skill>/scripts/validate_palette.js "#5a8ff3,#0c996f,#cd6722,#188db9,#c75f7b,#989a37" --mode dark --surface "#0b1011" --pairs all
  PASS  Lightness band       all 6 inside L 0.48 to 0.67
  PASS  Chroma floor         all 6 >= 0.1
  FAIL  CVD separation       worst all-pairs #c75f7b and #0c996f distance 2.1 (deutan) ; tritan 2.2
  FAIL  Normal-vision floor  worst all-pairs #188db9 and #5a8ff3 distance 10.3 (normal): below 15, hard to tell apart even with full color vision
  PASS  Contrast vs surface  all 6 >= 3:1
  exit code 1  (dark, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#5a8ff3,#0c996f,#cd6722,#188db9,#c75f7b,#989a37" --mode dark --surface "#111718" --pairs all
  PASS  Lightness band       all 6 inside L 0.48 to 0.67
  PASS  Chroma floor         all 6 >= 0.1
  FAIL  CVD separation       worst all-pairs #c75f7b and #0c996f distance 2.1 (deutan) ; tritan 2.2
  FAIL  Normal-vision floor  worst all-pairs #188db9 and #5a8ff3 distance 10.3 (normal): below 15, hard to tell apart even with full color vision
  PASS  Contrast vs surface  all 6 >= 3:1
  exit code 1  (dark, --color-surface-panel)

$ node <dataviz skill>/scripts/validate_palette.js "#345fb2,#1d916a,#a75217,#0d89b4,#862c48,#667015" --mode light --surface "#f8fbfb" --pairs all
  PASS  Lightness band       all 6 inside L 0.43 to 0.77
  PASS  Chroma floor         all 6 >= 0.1
  FAIL  CVD separation       worst all-pairs #667015 and #a75217 distance 2.4 (deutan) ; tritan 2.6
  FAIL  Normal-vision floor  worst all-pairs #667015 and #1d916a distance 11.4 (normal): below 15, hard to tell apart even with full color vision
  PASS  Contrast vs surface  all 6 >= 3:1
  exit code 1  (light, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#345fb2,#1d916a,#a75217,#0d89b4,#862c48,#667015" --mode light --surface "#eef4f4" --pairs all
  PASS  Lightness band       all 6 inside L 0.43 to 0.77
  PASS  Chroma floor         all 6 >= 0.1
  FAIL  CVD separation       worst all-pairs #667015 and #a75217 distance 2.4 (deutan) ; tritan 2.6
  FAIL  Normal-vision floor  worst all-pairs #667015 and #1d916a distance 11.4 (normal): below 15, hard to tell apart even with full color vision
  PASS  Contrast vs surface  all 6 >= 3:1
  exit code 1  (light, --color-surface-panel)
```

### Ordinal ramp, five steps

Tokens: `--color-chart-ord-1 --color-chart-ord-2 --color-chart-ord-3 --color-chart-ord-4 --color-chart-ord-5`. Flags: `--ordinal`.

**Claim: holds.** All four ordinal checks pass. `DESIGN.md` holds the ramp to more than the validator does: every step, not only the lightest, clears 3:1 on every fill that carries marks (checker, "Chart marks on fills").

```
$ node <dataviz skill>/scripts/validate_palette.js "#4887c5,#579de2,#70b3f7,#9ac9fa,#c3defb" --mode dark --surface "#0b1011" --ordinal
  PASS  Lightness monotone   steps read lighttodark
  PASS  Adjacent lightness step all gaps >= 0.06
  PASS  Light-end contrast   #4887c5 at 5.06:1 vs surface
  PASS  Single hue           hue spread 0 degrees
  exit code 0  (dark, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#4887c5,#579de2,#70b3f7,#9ac9fa,#c3defb" --mode dark --surface "#111718" --ordinal
  PASS  Lightness monotone   steps read lighttodark
  PASS  Adjacent lightness step all gaps >= 0.06
  PASS  Light-end contrast   #4887c5 at 4.78:1 vs surface
  PASS  Single hue           hue spread 0 degrees
  exit code 0  (dark, --color-surface-panel)

$ node <dataviz skill>/scripts/validate_palette.js "#4281bf,#246cad,#0e5794,#0a4475,#073257" --mode light --surface "#f8fbfb" --ordinal
  PASS  Lightness monotone   steps read lighttodark
  PASS  Adjacent lightness step all gaps >= 0.06
  PASS  Light-end contrast   #4281bf at 3.94:1 vs surface
  PASS  Single hue           hue spread 0 degrees
  exit code 0  (light, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#4281bf,#246cad,#0e5794,#0a4475,#073257" --mode light --surface "#eef4f4" --ordinal
  PASS  Lightness monotone   steps read lighttodark
  PASS  Adjacent lightness step all gaps >= 0.06
  PASS  Light-end contrast   #4281bf at 3.68:1 vs surface
  PASS  Single hue           hue spread 0 degrees
  exit code 0  (light, --color-surface-panel)
```

### Sequential ramp, seven steps, run in the ordinal mode

Tokens: `--color-chart-seq-1 --color-chart-seq-2 --color-chart-seq-3 --color-chart-seq-4 --color-chart-seq-5 --color-chart-seq-6 --color-chart-seq-7`. Flags: `--ordinal`.

**Claim: one hue, one direction, visible steps. Holds.** The validator has no mode for a sequential ramp; its ordinal mode checks the three properties that apply (lightness in one direction, steps of at least 0.06, one hue) and all three pass. The fourth check, contrast of the step nearest the surface, belongs to ordinal marks and fails here by design: a sequential step is a cell fill whose lowest values recede, and every cell prints its value. So the exit code is 1 and the run is still the expected result. The checker enforces the three properties and requires each step to be the background of a checked text pair ("Chart ramps").

```
$ node <dataviz skill>/scripts/validate_palette.js "#12283e,#1c3c5c,#27527d,#35699d,#4681bc,#599adb,#70b3f7" --mode dark --surface "#0b1011" --ordinal
  PASS  Lightness monotone   steps read lighttodark
  PASS  Adjacent lightness step all gaps >= 0.06
  FAIL  Light-end contrast   #12283e at 1.28:1 vs surface: below 2:1 floor
  PASS  Single hue           hue spread 1 degrees
  exit code 1  (dark, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#12283e,#1c3c5c,#27527d,#35699d,#4681bc,#599adb,#70b3f7" --mode dark --surface "#111718" --ordinal
  PASS  Lightness monotone   steps read lighttodark
  PASS  Adjacent lightness step all gaps >= 0.06
  FAIL  Light-end contrast   #12283e at 1.21:1 vs surface: below 2:1 floor
  PASS  Single hue           hue spread 1 degrees
  exit code 1  (dark, --color-surface-panel)

$ node <dataviz skill>/scripts/validate_palette.js "#d9eafc,#a8cbf1,#79ace1,#508fcd,#2f72b1,#165993,#094171" --mode light --surface "#f8fbfb" --ordinal
  PASS  Lightness monotone   steps read lighttodark
  PASS  Adjacent lightness step all gaps >= 0.06
  FAIL  Light-end contrast   #d9eafc at 1.18:1 vs surface: below 2:1 floor
  PASS  Single hue           hue spread 1 degrees
  exit code 1  (light, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#d9eafc,#a8cbf1,#79ace1,#508fcd,#2f72b1,#165993,#094171" --mode light --surface "#eef4f4" --ordinal
  PASS  Lightness monotone   steps read lighttodark
  PASS  Adjacent lightness step all gaps >= 0.06
  FAIL  Light-end contrast   #d9eafc at 1.10:1 vs surface: below 2:1 floor
  PASS  Single hue           hue spread 1 degrees
  exit code 1  (light, --color-surface-panel)
```

### Status marks, every pair

Tokens: `--color-chart-status-danger --color-chart-status-warning --color-chart-status-success`. Flags: `--pairs all`.

**Claim: at least 15 apart in normal vision, at least 6 under simulated color blindness, 3:1 on every fill. Holds.** The color-blind result is a WARN in both themes: between the floor of 6 and the target of 8, which the method allows only with a second cue. Every status mark carries an icon and a label, so the cue is always there. The lightness band is a rule for series, and in the dark theme the status marks sit above it on purpose (0.71 to 0.83 against a series band that ends at 0.67), so that a state is brighter than any series. That is why the dark runs exit with 1; the light runs pass. The checker enforces the three claimed properties ("Chart status", "Chart marks on fills") and does not apply the band to status marks.

```
$ node <dataviz skill>/scripts/validate_palette.js "#f97165,#f1b337,#89e080" --mode dark --surface "#0b1011" --pairs all
  FAIL  Lightness band       outside band: [["#f97165",0.71],["#f1b337",0.804],["#89e080",0.829]]
  PASS  Chroma floor         all 3 >= 0.1
  WARN  CVD separation       worst all-pairs #89e080 and #f1b337 distance 6.5 (deutan) ; tritan 14.4
  PASS  Normal-vision floor  worst all-pairs #89e080 and #f1b337 distance 15.9 (normal)
  PASS  Contrast vs surface  all 3 >= 3:1
  exit code 1  (dark, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#f97165,#f1b337,#89e080" --mode dark --surface "#111718" --pairs all
  FAIL  Lightness band       outside band: [["#f97165",0.71],["#f1b337",0.804],["#89e080",0.829]]
  PASS  Chroma floor         all 3 >= 0.1
  WARN  CVD separation       worst all-pairs #89e080 and #f1b337 distance 6.5 (deutan) ; tritan 14.4
  PASS  Normal-vision floor  worst all-pairs #89e080 and #f1b337 distance 15.9 (normal)
  PASS  Contrast vs surface  all 3 >= 3:1
  exit code 1  (dark, --color-surface-panel)

$ node <dataviz skill>/scripts/validate_palette.js "#b30614,#a17b0f,#1a6214" --mode light --surface "#f8fbfb" --pairs all
  PASS  Lightness band       all 3 inside L 0.43 to 0.77
  PASS  Chroma floor         all 3 >= 0.1
  WARN  CVD separation       worst all-pairs #1a6214 and #b30614 distance 6.9 (deutan) ; tritan 15.6
  PASS  Normal-vision floor  worst all-pairs #1a6214 and #a17b0f distance 20.5 (normal)
  PASS  Contrast vs surface  all 3 >= 3:1
  exit code 0  (light, --color-surface-app)

$ node <dataviz skill>/scripts/validate_palette.js "#b30614,#a17b0f,#1a6214" --mode light --surface "#eef4f4" --pairs all
  PASS  Lightness band       all 3 inside L 0.43 to 0.77
  PASS  Chroma floor         all 3 >= 0.1
  WARN  CVD separation       worst all-pairs #1a6214 and #b30614 distance 6.9 (deutan) ; tritan 15.6
  PASS  Normal-vision floor  worst all-pairs #1a6214 and #a17b0f distance 20.5 (normal)
  PASS  Contrast vs surface  all 3 >= 3:1
  exit code 0  (light, --color-surface-panel)
```

## The checker's results for the same colors

`node tools/design/check-tokens.mjs`, the chart sections of its output. Exit code 0.

```
Chart marks on fills (WCAG 2 ratio, minimum 3; every mark on every fill that carries marks)
  mark                            dark, lowest on                       light, lowest on
  --color-chart-neutral            3.43  accent-subtle-hover             3.44  surface-pressed
  --color-chart-neutral-hover      4.70  accent-subtle-hover             4.63  surface-pressed
  --color-chart-neutral-selected   6.23  accent-subtle-hover             6.53  surface-pressed
  --color-chart-1                  3.94  accent-subtle-hover             4.78  surface-pressed
  --color-chart-2                  3.43  accent-subtle-hover             3.08  surface-pressed
  --color-chart-3                  3.29  accent-subtle-hover             4.24  surface-pressed
  --color-chart-4                  3.28  accent-subtle-hover             3.12  surface-pressed
  --color-chart-5                  3.16  accent-subtle-hover             6.64  surface-pressed
  --color-chart-6                  4.15  accent-subtle-hover             4.21  surface-pressed
  --color-chart-other              3.43  accent-subtle-hover             3.44  surface-pressed
  --color-chart-ord-1              3.28  accent-subtle-hover             3.20  surface-pressed
  --color-chart-ord-2              4.33  accent-subtle-hover             4.28  surface-pressed
  --color-chart-ord-3              5.61  accent-subtle-hover             5.83  surface-pressed
  --color-chart-ord-4              7.16  accent-subtle-hover             7.81  surface-pressed
  --color-chart-ord-5              8.97  accent-subtle-hover            10.22  surface-pressed
  --color-chart-status-danger      4.48  accent-subtle-hover             5.55  surface-pressed
  --color-chart-status-warning     6.65  accent-subtle-hover             3.06  surface-pressed
  --color-chart-status-success     7.71  accent-subtle-hover             5.85  surface-pressed
  18 mark tokens on 10 fills that carry marks: 360 pairs checked, minimum 3
  fills: surface-app, surface-panel, surface-raised, surface-overlay, surface-hover, surface-pressed, surface-overlay-hover, accent-subtle, accent-subtle-hover, chart-band

Chart series (distance in OKLab times 100)
  dark, neighbouring slots: closest 9.9 color-blind (chart-5, chart-6), 20.9 normal (chart-5, chart-6)
  dark, slots 1 to 3, every pair: closest 10.3 color-blind (chart-2, chart-3), 22.1 normal (chart-1, chart-2)
  dark, all 6 slots, every pair (not a claim, see DESIGN.md): closest 10.3 normal (chart-1, chart-4)
  light, neighbouring slots: closest 9.2 color-blind (chart-2, chart-3), 21.1 normal (chart-1, chart-2)
  light, slots 1 to 3, every pair: closest 9.2 color-blind (chart-2, chart-3), 21.1 normal (chart-1, chart-2)
  light, all 6 slots, every pair (not a claim, see DESIGN.md): closest 11.4 normal (chart-2, chart-6)
  6 slots in slot order; minimums 8 color-blind and 15 normal, chroma floor 0.1

Chart status (distance in OKLab times 100)
  dark, status marks, every pair: closest 6.5 color-blind (chart-status-warning, chart-status-success), 15.9 normal (chart-status-warning, chart-status-success)
  dark, series slot against status mark: closest 10.7 (chart-3, chart-status-danger)
  light, status marks, every pair: closest 6.9 color-blind (chart-status-danger, chart-status-success), 20.5 normal (chart-status-warning, chart-status-success)
  light, series slot against status mark: closest 10.2 (chart-6, chart-status-success)
  minimums 6 color-blind and 15 normal between status marks, 10 between a series slot and a status mark

Chart ramps
  --color-chart-seq-1 to 7: one hue, lightness runs one way in steps of at least 0.06, in both themes
  --color-chart-ord-1 to 5: one hue, lightness runs one way in steps of at least 0.06, in both themes
  every sequential step is the background of a text pair (7 steps)
```

## The order search

The slot order is the mechanism that keeps neighbouring series apart, so it was searched, not guessed. `node tools/design/check-tokens.mjs --orders` lists every order of the six colors whose neighbours, and whose first three slots with every pair compared, meet the minimums in both themes. Slot numbers in the output are those of the current order: 1 blue, 2 jade, 3 burnt orange, 4 sky, 5 rose, 6 olive.

```
720 orders of 6 slots; 30 pass in both themes
(neighbours and every pair of the first 3: at least 8 color-blind and 15 normal)
columns: order by current slot number | neighbours color-blind, normal | first 3 color-blind, normal
  6 5 4 3 1 2 |   9.9  20.9 |   9.9  20.1
  5 6 4 3 1 2 |   9.9  20.1 |   9.9  20.1
  6 1 5 4 3 2 |   9.2  21.4 |   9.9  20.9
  1 2 3 4 5 6 |   9.2  20.9 |   9.2  21.1  <- current order
  1 6 5 4 3 2 |   9.2  20.9 |   9.9  20.9
  2 1 3 4 5 6 |   9.9  20.9 |   9.2  21.1
  2 3 1 6 5 4 |   9.2  20.9 |   9.2  21.1
  3 2 1 6 5 4 |   9.2  20.9 |   9.2  21.1
  4 5 6 1 2 3 |   9.2  20.9 |   9.9  20.1
  4 5 6 1 3 2 |   9.2  20.9 |   9.9  20.1
  5 6 1 2 3 4 |   9.2  20.9 |   9.9  20.9
  6 5 1 2 3 4 |   9.2  20.9 |   9.9  20.9
  6 5 4 3 2 1 |   9.2  20.9 |   9.9  20.1
  1 2 3 4 6 5 |   9.2  20.1 |   9.2  21.1
  1 5 6 4 3 2 |   9.2  20.1 |   9.9  20.9
  2 1 3 4 6 5 |   9.9  20.1 |   9.2  21.1
  2 3 1 5 4 6 |   9.2  20.1 |   9.2  21.1
  2 3 1 5 6 4 |   9.2  20.1 |   9.2  21.1
  2 3 1 6 4 5 |   9.2  20.1 |   9.2  21.1
  3 2 1 5 4 6 |   9.2  20.1 |   9.2  21.1
  3 2 1 5 6 4 |   9.2  20.1 |   9.2  21.1
  3 2 1 6 4 5 |   9.2  20.1 |   9.2  21.1
  4 6 5 1 2 3 |   9.2  20.1 |   9.9  20.1
  4 6 5 1 3 2 |   9.2  20.1 |   9.9  20.1
  5 1 6 4 3 2 |   9.2  20.1 |   9.9  20.9
  5 4 6 1 2 3 |   9.2  20.1 |   9.9  20.1
  5 4 6 1 3 2 |   9.2  20.1 |   9.9  20.1
  5 6 4 3 2 1 |   9.2  20.1 |   9.9  20.1
  6 4 5 1 2 3 |   9.2  20.1 |   9.9  20.1
  6 4 5 1 3 2 |   9.2  20.1 |   9.9  20.1
```

30 of the 720 orders pass. The best of them reach 9.9 between neighbours under simulated color blindness; the chosen order reaches 9.2. It was chosen among the passing orders for its first three slots: blue, jade, and burnt orange are one cool, one green, and one warm color, the most familiar opening for a chart, and they are the three that any chart with up to three series shows. Rose and olive, the two least familiar, come last. The method allows this choice: any passing order is safe, and the opening may be picked among them.

## How the values were chosen

The requirements that fixed the values, in the order they bind:

1. **Every mark at 3:1 on every fill that carries marks.** In the dark theme the lightest such fill is `--color-accent-subtle-hover`, which puts every mark at a lightness of about 0.58 to 0.61 or more, depending on its hue; the series band of the validator ends at 0.67. In the light theme the darkest fills are `--color-surface-pressed` and `--color-accent-subtle-hover`, which puts every mark at about 0.59 to 0.63 or less.
2. **Hues that mean nothing else.** Red, amber, the green of success, teal within 25 degrees of the accent, and 270 to 350 are taken. Six arcs remain, and the set has one color in each: rose (5), burnt orange (50), olive (110 in dark, 116 in light), jade (165), sky (230), blue (262). Rose and burnt orange keep the hues of the first version, as the owner decided. Gold (88) and green (148) of the first version sat 3.7 and 3.1 from the warning and success marks in the light theme and were replaced by olive and jade.
3. **At least 10 between every slot and every status mark.** This is the largest minimum the set holds with rose and burnt orange in it at a lightness where burnt orange is still an orange and not a brown. A minimum of 12 was tried, and the search found no set that met it together with the other requirements. The status marks were re-stepped at the same time: in dark they sit above the series band, and in light danger and success are dark and warning is the lightest of the three.
4. **Neighbours at least 8 apart under simulated color blindness and 15 in normal vision,** in some order, with the first three slots passing with every pair compared.

Lightness and chroma were searched inside those limits (a throwaway search that scored candidate sets on the four requirements, followed by rounding to steps of 0.005 and a re-check). The search scripts are not in the repository; the result is what the two tools above verify.

Closest pairs after the search, from the checker: series slot against status mark 10.7 in dark (burnt orange, danger) and 10.2 in light (olive, success); neighbouring slots 9.9 and 9.2 under simulated color blindness; status marks 15.9 and 20.5 in normal vision.
