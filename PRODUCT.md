# Product

## Register

product

## Users

Hold Explorer is used by the whole project organization of a piping project: piping engineers, their leads, and managers. Some are fluent in engineering software; some open the app once a week and are not technical. All of them know Excel.

Two scenes describe where it is used. Every design decision is tested against both.

1. **The desk.** A piping engineer sits at a desk with two monitors. One shows the 3D plant model on a dark canvas for hours at a time. Hold Explorer is on the other. Between modeling sessions the engineer works down the hold list: which of my lines are on hold, what does each wait for, what changed since the last export. The work is long, repetitive, and done from the keyboard.
2. **The meeting room.** A lead stands at a wall screen in the weekly hold review, blinds half open, eight people around the table, some with printed line lists. The lead shows Overview, answers "how many, how old, who must act", and drills into one discipline when someone asks. The screen is read from four meters away, and nobody in the room wants to watch someone operate software.

The job in both scenes is the same: find out what is on hold, why, what changed, and what to solve first, then get back to the real work.

## Product Purpose

Hold Explorer reads the holds report exported from the project's piping system as a spreadsheet. It derives the blocker each hold waits for, keeps each import as a snapshot, and shows what is on hold, why, how that changed between snapshots, and which blockers free the most lines when solved.

It replaces a single HTML file that embedded one data snapshot, kept no history, and needed someone to trim the export by hand.

Success looks like this:

- An engineer drops in this week's export and has an answer in under a minute, without preparing the file.
- A lead runs the weekly review from Overview and never opens the spreadsheet.
- A number on the screen matches the export, and when the app had to interpret something, it says so.
- Everything works offline, from one portable file, on Windows and Linux.

## Brand Personality

Hold Explorer has a neutral identity: its own name, no company marks. Three words describe it: **plain, exact, calm.**

It speaks like a careful colleague who has read the whole export: states what it found, in the user's terms, and stops.

### Tone of text

- **Plain.** Short sentences. Common words. "12 rows were skipped" and not "Some records could not be processed".
- **Specific.** Give the number, the name, the row, the file. "Row 418: release date `31/02/2026` cannot be read" beats "Invalid date".
- **No marketing voice.** No exclamation marks, no "Welcome back", no "Oops", no "powerful", no praise for the user, no emoji.
- **Labels are names; actions are verbs.** A destination is "Lines". A button is "Import", "Export", "Go to Overview". A button never says "OK", "Yes", or "Submit".
- **Sentence case everywhere.** "Open history bundle", not "Open History Bundle".
- **An error says what happened, why, and how to fix it**, in that order, and never blames the user.
- **A destructive action is undone, not confirmed.** The text after the action says what was done and offers "Undo".
- **Nothing is changed silently.** When the app assumed something (a date order, a snapshot date taken from the file name), the text says what it assumed and where to change it.
- **A destination that is not built yet says so plainly.** Its screen states what the destination will show and that it is not available in this version. It does not apologize and does not promise a date or a version.

### Glossary

One term per concept. The interface uses these words and no synonyms.

| Term | Meaning | Never call it |
|---|---|---|
| Hold | One reason a line cannot proceed; one row of the export. | issue, item, record, ticket |
| Line | A piping line, identified by its line ID. On hold while it has at least one open hold. | pipe, entry |
| Blocker | The thing a hold waits for, derived from the hold remark. | dependency, cause, constraint |
| Snapshot | One imported export file, stamped with the report date. | import, version, upload, revision |
| Workspace | One project's data: its snapshots, rules, mappings, saved views, notes. | project, database, file |
| Saved view | A named combination of destination, filters, grouping, and sort. | preset, bookmark, favorite |

### Writing for translation

The interface is English now. Every string lives in a translation file, so the text is written to survive translation.

- One complete sentence per string. Never build a sentence from fragments in code.
- Named placeholders: `{count} holds on {lineCount} lines`. Plural forms are chosen by the translation library, never by adding an "s".
- No idioms, no puns, no abbreviations that are not on the export itself. Units are written the way the audience writes them: `71 d`, `6"`.
- No text inside images. No meaning carried by letter case.
- Leave room: a label may grow by 40 percent in another language. No fixed-width buttons.
- Dates, numbers, and thousands separators are formatted by locale, never by hand.

## Anti-references

What Hold Explorer must not look like.

- **A startup analytics dashboard.** No big-number hero tiles with gradient accents, no grid of identical cards each with an icon, a heading, and a paragraph, no sparkline decorating every number.
- **A dark "AI tool" skin.** No purple or violet anywhere in the interface chrome, no glowing gradients, no neon on black, no blurred glass panels.
- **A CAD or control-room console.** No safety orange, no hazard stripes, no all-caps monospace labels, no fake instrument panels.
- **The old single-file tool.** No everything-on-one-page layout, no color that means "this cell is high" without a label, no state that exists only on hover.
- **An enterprise form from 2010.** No modal dialog for every step, no confirmation prompt before every action, no toolbar of twenty unlabeled icons.

Banned patterns, by name:

- Colored side stripes on cards, rows, list items, or notices.
- Gradient text.
- Decorative glass (blur and translucency used as a style).
- The hero-metric tile (large number, small label, gradient accent).
- Grids of identical cards.
- Nested cards.
- A modal as the first thought. Import review and column mapping are pages.
- Em dashes in interface text.

## Design Principles

1. **The tool disappears into the task.** The user came for the holds. Every element either shows the data or moves the user through it. Decoration that does neither is removed.
2. **Familiar patterns are a feature.** A sidebar, a table, tabs, a search box, and a detail panel behave the way this audience already expects from Excel and from the best current tools. Nothing is reinvented for flavor.
3. **Calm overview, dense detail.** Overview and History are roomy and readable from across a meeting room. Lines, Breakdown, and Blockers are tables first, as dense as the engineer chooses.
4. **Keyboard first.** The main flow (import, filter, find a line, read its holds, export) completes without a pointer. Focus is always visible. Nothing is reachable by hover alone.
5. **Nothing silently changed.** The app never alters a value, assumes a date, or drops a row without saying so and showing where. A destructive action can be undone.

## Accessibility & Inclusion

- Contrast meets WCAG 2.1 AA in both themes: 4.5:1 for text, 3:1 for large text, for the boundary of every control, for the focus ring, and for every chart mark on every fill it can sit on. `tools/design/check-tokens.mjs` enforces this from the tables in `DESIGN.md`. One exception is stated there: the fill of the primary button while it is pressed, in the dark theme, where the label carries the button.
- Color never carries meaning alone. Every state has an icon and a label; every chart series has a text label and a table view.
- Teal always means the same thing: something that can be acted on, or the current selection. Data is never drawn in it.
- Chart series are validated for protanopia and deuteranopia in both themes. A series color keeps a stated minimum distance from every status color in normal vision; under red-green color blindness a status is told from a series by its icon and label. The results are recorded in `tools/design/palette-validation.md`.
- All motion marks a state change, lasts 150 to 250 ms, and is removed when the system asks for reduced motion.
- Every action is reachable by keyboard, in a logical order, with a visible focus ring.
- No text is smaller than 13 px. Type sizes are in `rem`, so text follows the root size.
- The dark theme is the default; a light theme, designed separately, is available by setting or by following the system.
