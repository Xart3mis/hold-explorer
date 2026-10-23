// What the specs do in the window, in the words a user reads: elements are found by their role and
// their accessible name, as the interface tests find them, with the names taken from the text
// catalog, ui/src/locales/en.json.
import en from "../../ui/src/locales/en.json" with { type: "json" };

/** The text catalog of the interface. */
export const text = en;

/** A catalog text with its `{{name}}` placeholders filled. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{\{\s*([\w]+)[^}]*\}\}/g,
    (whole, name: string) => values[name] ?? whole,
  );
}

/** The accessible name to look for: the whole name, or a pattern it matches. */
export type Name = string | RegExp;

/** `value` as a pattern that matches exactly it. */
export function literal(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A name that starts with `start`, then ends or goes on after a space. */
export function startsWith(start: string): RegExp {
  return new RegExp(`^${literal(start)}(\\s|$)`);
}

/** Where to look: anywhere, or inside an element found before (`scope` of `find`). */
export interface Where {
  within?: string;
  timeout?: number;
}

let marks = 0;

/**
 * Runs in the page. Marks the first shown element of `role` whose accessible name is `name` (or
 * matches the pattern `source`/`flags`) with `data-e2e="<token>"`, inside the element `scope`
 * selects, and says whether one was found. The name is read as the accessibility tree reads it in
 * the cases the interface uses: `aria-label`, then `aria-labelledby`, then a `<label for>`, then
 * the text inside.
 */
function markInPage(
  role: string,
  name: string,
  flags: string | null,
  scope: string | null,
  token: string,
): boolean {
  const implicit: Record<string, string> = {
    button: 'button, [role="button"]',
    link: 'a[href], [role="link"]',
    heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
    textbox:
      'input:not([type]), input[type="text"], input[type="search"], textarea, [role="textbox"]',
    dialog: 'dialog, [role="dialog"], [role="alertdialog"]',
    list: 'ul, ol, [role="list"]',
  };
  const selector = implicit[role] ?? `[role="${role}"]`;
  const root = scope === null ? document : document.querySelector(scope);
  if (root === null) return false;
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const nameOf = (element: Element): string => {
    const label = element.getAttribute("aria-label");
    if (label !== null && label !== "") return clean(label);
    const by = element.getAttribute("aria-labelledby");
    if (by !== null && by !== "") {
      return clean(
        by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" "),
      );
    }
    if (element.id !== "") {
      const owner = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (owner !== null) return clean(owner.textContent);
    }
    return clean(element.textContent);
  };
  const matches =
    flags === null
      ? (candidate: string) => candidate === name
      : (candidate: string) => new RegExp(name, flags).test(candidate);
  for (const old of document.querySelectorAll(`[data-e2e="${token}"]`)) {
    old.removeAttribute("data-e2e");
  }
  const found = [...root.querySelectorAll(selector)].find(
    (element) => element.getClientRects().length > 0 && matches(nameOf(element)),
  );
  if (found === undefined) return false;
  found.setAttribute("data-e2e", token);
  return true;
}

/**
 * Waits for a shown element of `role` named `name`, and returns a selector of it, to look inside
 * it (`within`) or to take it with `$`.
 */
export async function scope(role: string, name: Name, where: Where = {}): Promise<string> {
  marks += 1;
  const token = `m${String(marks)}`;
  const source = typeof name === "string" ? name : name.source;
  const flags = typeof name === "string" ? null : name.flags;
  await browser.waitUntil(
    () => browser.execute(markInPage, role, source, flags, where.within ?? null, token),
    {
      ...(where.timeout === undefined ? {} : { timeout: where.timeout }),
      timeoutMsg: `No ${role} named ${String(name)} was shown${where.within === undefined ? "" : ` within ${where.within}`}.`,
    },
  );
  return `[data-e2e="${token}"]`;
}

/** Waits for a shown element of `role` named `name`, and returns it. */
export async function find(role: string, name: Name, where: Where = {}) {
  return $(await scope(role, name, where));
}

/** Waits for the element and presses it with the pointer. */
export async function press(role: string, name: Name, where: Where = {}): Promise<void> {
  const element = await find(role, name, where);
  await element.waitForClickable();
  await element.click();
}

/** Whether a control can be pressed: not disabled, natively or by its ARIA state. */
export async function isEnabled(element: WebdriverIO.Element): Promise<boolean> {
  const disabled = await element.getAttribute("disabled");
  const ariaDisabled = await element.getAttribute("aria-disabled");
  return disabled === null && ariaDisabled !== "true";
}

/** The text of the element as one line, its runs of white space made one space. */
export async function textOf(selector: string): Promise<string> {
  const content = await browser.execute(
    (target: string) => document.querySelector(target)?.textContent ?? null,
    selector,
  );
  if (content === null) throw new Error(`Nothing matches ${selector}.`);
  return content.replace(/\s+/g, " ").trim();
}

/** The keys WebDriver names by code points of its own. */
export const KEYS = { control: "\uE009", escape: "\uE00C" } as const;

/** Presses one key, with Ctrl held when `ctrl` is set, as a user types it. */
export async function key(value: string, { ctrl = false }: { ctrl?: boolean } = {}): Promise<void> {
  const keys = browser.action("key");
  if (ctrl) keys.down(KEYS.control);
  keys.down(value).up(value);
  if (ctrl) keys.up(KEYS.control);
  await keys.perform();
}

/** Takes the focus off any field, so that a key reaches the page and not a field. */
export async function focusPage(): Promise<void> {
  await browser.execute(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

/** Waits for the page title (the `h1`) of a screen. The first start of the window takes a while. */
export async function pageTitled(title: string, timeout?: number): Promise<void> {
  await find("heading", title, timeout === undefined ? {} : { timeout });
}

/** The first screen of a fresh start: the list of workspaces, with nothing in it. */
export async function started(): Promise<void> {
  await pageTitled(text.workspaces.title, 120_000);
}

/** The four figures of the Overview, once they hold numbers and no skeleton. */
export async function overviewFigures(): Promise<string> {
  const figures = await scope("group", text.overview.figures);
  let shown = "";
  await browser.waitUntil(
    async () => {
      shown = await textOf(figures);
      return !shown.includes(text.common.loading) && /\d/.test(shown);
    },
    { timeoutMsg: `The Overview figures did not load; they read "${shown}".` },
  );
  return shown;
}

/** From the first screen: opens the demo workspace, and waits for its Overview. */
export async function openDemo(): Promise<void> {
  await started();
  await press("button", text.welcome.demoOpen);
  // The demo workspace is built from synthetic holds when it is opened.
  await pageTitled(text.destinations.name.overview, 120_000);
  await overviewFigures();
}

/**
 * From the first screen: imports the synthetic workbook of the run, which the open dialog's
 * substitute answers with, into the new workspace the review proposes, and waits for its Overview.
 */
export async function importWorkbook(): Promise<void> {
  await started();
  await press("button", text.welcome.openFile);
  await pageTitled(text.import.review.title, 60_000);
  const importButton = await find("button", text.import.review.import);
  await browser.waitUntil(() => isEnabled(importButton), {
    timeout: 60_000,
    timeoutMsg: "The review never allowed the import.",
  });
  await importButton.click();
  await pageTitled(text.destinations.name.overview, 60_000);
  await overviewFigures();
}

/** The selector of the filter bar's total, and its text once it is read and not on its way. */
export async function filterTotal(): Promise<string> {
  const total = '[data-part="filter-total"]';
  let shown = "";
  await browser.waitUntil(
    async () => {
      const element = await $(total);
      if (!(await element.isExisting())) return false;
      if ((await element.getAttribute("aria-busy")) === "true") return false;
      shown = await textOf(total);
      return /\d/.test(shown);
    },
    { timeoutMsg: "The total of the filter bar was not read." },
  );
  return shown;
}

/** The labels of the filter chips of the bar, in order: the text of each chip's first button. */
export async function chipLabels(): Promise<string[]> {
  return browser.execute(() =>
    [...document.querySelectorAll('[data-part="filter-chip"]')].map((chip) =>
      (chip.querySelector("button")?.textContent ?? "").replace(/\s+/g, " ").trim(),
    ),
  );
}

/**
 * Adds a filter on Discipline with its first value, and closes the editor. Returns the chip's
 * label.
 */
export async function addDisciplineFilter(): Promise<string> {
  const before = await chipLabels();
  await $('[data-part="add-filter-chip"]').click();
  const fields = await scope("menu", text.filters.picker.fields);
  await press("menuitem", startsWith(text.import.field.Discipline), { within: fields });
  const editor = await scope(
    "dialog",
    fill(text.filters.picker.filterBy, { field: text.import.field.Discipline }),
  );
  const first = await $(`${editor} [role="option"]`);
  await first.waitForClickable();
  await first.click();
  await key(KEYS.escape);
  let added: string | undefined;
  await browser.waitUntil(
    async () => {
      const labels = await chipLabels();
      added = labels.find((label) => !before.includes(label));
      return added !== undefined;
    },
    { timeoutMsg: "No Discipline chip was added to the filter bar." },
  );
  if (added === undefined) throw new Error("No Discipline chip was added to the filter bar.");
  return added;
}
