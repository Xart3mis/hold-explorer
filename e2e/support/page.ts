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

/** An element told by its role and accessible name, found afresh each time it is looked for. */
export interface Locator {
  role: string;
  name: Name;
}

/**
 * Where to look: anywhere, or inside an element. That element is a selector of one found before
 * (`scope`), or a locator found again on each try, for an element the page may render anew (a
 * list in a popover). With `enabled`, only an element that is not disabled counts.
 */
export interface Where {
  within?: string | Locator;
  timeout?: number;
  enabled?: boolean;
}

/** A locator as the page receives it: plain data, the pattern as its source and flags. */
interface PageLocator {
  role: string;
  source: string;
  flags: string | null;
}

/** What the page saw when it looked: whether the element was there, and, for an error, what was. */
interface Sighting {
  found: boolean;
  /** Whether the element to look inside was there. */
  scoped: boolean;
  /** The names of the shown elements of the role, in order (the first 20). */
  seen: string[];
  /** The shown text fields and comboboxes, each as its name and its value. */
  fields: string[];
}

function toPage(role: string, name: Name): PageLocator {
  return typeof name === "string"
    ? { role, source: name, flags: null }
    : { role, source: name.source, flags: name.flags };
}

/** `within` as the page receives it. */
function scopeOf(where: Where): string | PageLocator | null {
  const within = where.within;
  if (within === undefined) return null;
  return typeof within === "string" ? within : toPage(within.role, within.name);
}

/** `within` as an error message names it. */
function describeScope(where: Where): string {
  const within = where.within;
  if (within === undefined) return "";
  return typeof within === "string"
    ? ` within ${within}`
    : ` within the ${within.role} named ${String(within.name)}`;
}

/** What the page saw, as the end of an error message. */
function describeSighting(role: string, sighting: Sighting | undefined, where: Where): string {
  if (sighting === undefined) return "";
  if (!sighting.scoped) return ` The element to look in${describeScope(where)} was not there.`;
  const seen =
    sighting.seen.length === 0
      ? `No ${role} was shown.`
      : `The ${role} names shown: ${sighting.seen.map((name) => JSON.stringify(name)).join(", ")}.`;
  const fields =
    sighting.fields.length === 0 ? "" : ` The fields read: ${sighting.fields.join(", ")}.`;
  return ` ${seen}${fields}`;
}

let marks = 0;

/**
 * Runs in the page. Marks the first shown element of `target` (a role and a name, or a pattern
 * of it) with `data-e2e="<token>"`, inside the element `scope` gives, and says what it saw. With
 * no token, it marks nothing. The name is read as the accessibility tree reads it in the cases
 * the interface uses: `aria-label`, then `aria-labelledby`, then a `<label for>`, then the text
 * inside, leaving out what is inside an `aria-hidden` element. With `enabledOnly`, an element
 * that is disabled, natively or by `aria-disabled`, does not count.
 */
function markInPage(
  target: PageLocator,
  scope: string | PageLocator | null,
  token: string | null,
  enabledOnly: boolean,
): Sighting {
  const implicit: Record<string, string> = {
    button: 'button, [role="button"]',
    link: 'a[href], [role="link"]',
    heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
    textbox:
      'input:not([type]), input[type="text"], input[type="search"], textarea, [role="textbox"]',
    dialog: 'dialog, [role="dialog"], [role="alertdialog"]',
    list: 'ul, ol, [role="list"]',
  };
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  // The text of a node, without the text of the aria-hidden elements inside it (a search result
  // shows its ID once for the eye, aria-hidden, and once for the accessibility tree).
  const textOf = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node instanceof Element && node.getAttribute("aria-hidden") === "true") return "";
    return [...node.childNodes].map(textOf).join("");
  };
  const ownText = (element: Element): string => [...element.childNodes].map(textOf).join("");
  const nameOf = (element: Element): string => {
    const label = element.getAttribute("aria-label");
    if (label !== null && label !== "") return clean(label);
    const by = element.getAttribute("aria-labelledby");
    if (by !== null && by !== "") {
      return clean(
        by
          .split(/\s+/)
          .map((id) => {
            const labelling = document.getElementById(id);
            return labelling === null ? "" : ownText(labelling);
          })
          .join(" "),
      );
    }
    if (element.id !== "") {
      const owner = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (owner !== null) return clean(ownText(owner));
    }
    return clean(ownText(element));
  };
  const shownOf = (root: ParentNode, role: string) =>
    [...root.querySelectorAll(implicit[role] ?? `[role="${role}"]`)].filter(
      (element) => element.getClientRects().length > 0,
    );
  const named = (locator: PageLocator) => {
    const pattern = locator.flags === null ? null : new RegExp(locator.source, locator.flags);
    return (element: Element) => {
      const name = nameOf(element);
      return pattern === null ? name === locator.source : pattern.test(name);
    };
  };
  const fields = [...new Set([...shownOf(document, "textbox"), ...shownOf(document, "combobox")])]
    .filter((element) => element instanceof HTMLInputElement)
    .map((element) => `${JSON.stringify(nameOf(element))} = ${JSON.stringify(element.value)}`);
  const root =
    scope === null
      ? document
      : typeof scope === "string"
        ? document.querySelector(scope)
        : (shownOf(document, scope.role).find(named(scope)) ?? null);
  if (root === null) return { found: false, scoped: false, seen: [], fields };
  if (token !== null) {
    for (const old of document.querySelectorAll(`[data-e2e="${token}"]`)) {
      old.removeAttribute("data-e2e");
    }
  }
  const disabled = (element: Element) =>
    element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
  const candidates = shownOf(root, target.role);
  const found = candidates.find(
    (element) => !(enabledOnly && disabled(element)) && named(target)(element),
  );
  if (found !== undefined && token !== null) found.setAttribute("data-e2e", token);
  return {
    found: found !== undefined,
    scoped: true,
    seen: candidates.slice(0, 20).map(nameOf),
    fields,
  };
}

/**
 * Waits for a shown element of `role` named `name`, and returns a selector of it, to look inside
 * it (`within`) or to take it with `$`.
 */
export async function scope(role: string, name: Name, where: Where = {}): Promise<string> {
  marks += 1;
  const token = `m${String(marks)}`;
  let last: Sighting | undefined;
  try {
    await browser.waitUntil(
      async () => {
        last = await browser.execute(
          markInPage,
          toPage(role, name),
          scopeOf(where),
          token,
          where.enabled === true,
        );
        return last.found;
      },
      where.timeout === undefined ? {} : { timeout: where.timeout },
    );
  } catch (error: unknown) {
    // Nothing was ever seen: the page did not answer (a script error, a lost session).
    if (last === undefined) throw error;
    // The message says what was there instead, so that a failure explains itself.
    const cause = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(
      `No ${where.enabled === true ? "enabled " : ""}${role} named ${String(name)} was shown${describeScope(where)}.${describeSighting(role, last, where)}${cause}`,
      { cause: error },
    );
  }
  return `[data-e2e="${token}"]`;
}

/**
 * Runs in the page. Marks the first shown element that `selector` matches, inside the element
 * `scope` selects, with `data-e2e="<token>"`, and says whether there was one.
 */
function markFirstInPage(selector: string, scope: string | null, token: string): boolean {
  const root = scope === null ? document : document.querySelector(scope);
  if (root === null) return false;
  for (const old of document.querySelectorAll(`[data-e2e="${token}"]`)) {
    old.removeAttribute("data-e2e");
  }
  const found = [...root.querySelectorAll(selector)].find(
    (element) => element.getClientRects().length > 0,
  );
  if (found === undefined) return false;
  found.setAttribute("data-e2e", token);
  return true;
}

/**
 * Waits for the first shown element that the CSS `selector` matches, and returns a selector of
 * that one element alone: WebdriverIO's `$` refuses a selector that matches more than one.
 */
export async function first(
  selector: string,
  where: { within?: string; timeout?: number } = {},
): Promise<string> {
  marks += 1;
  const token = `m${String(marks)}`;
  await browser.waitUntil(
    () => browser.execute(markFirstInPage, selector, where.within ?? null, token),
    {
      ...(where.timeout === undefined ? {} : { timeout: where.timeout }),
      timeoutMsg: `Nothing shown matches ${selector}${where.within === undefined ? "" : ` within ${where.within}`}.`,
    },
  );
  return `[data-e2e="${token}"]`;
}

/** Whether an element of `role` named `name` is shown now, without waiting. */
export async function isShown(role: string, name: Name, where: Where = {}): Promise<boolean> {
  const sighting = await browser.execute(
    markInPage,
    toPage(role, name),
    scopeOf(where),
    null,
    where.enabled === true,
  );
  return sighting.found;
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
  // Found again on each try, enabled, as the review renders the button anew while it checks.
  await press("button", text.import.review.import, { enabled: true, timeout: 60_000 });
  await pageTitled(text.destinations.name.overview, 60_000);
  await overviewFigures();
}

/** The text of the filter bar's total, once it is read and not on its way. */
export async function filterTotal(): Promise<string> {
  let shown = "";
  await browser.waitUntil(
    async () => {
      // Read in one pass in the page, so that no element is held across a render.
      const read = await browser.execute(() => {
        const total = document.querySelector('[data-part="filter-total"]');
        if (total === null) return null;
        return {
          busy: total.getAttribute("aria-busy") === "true",
          text: total.textContent.replace(/\s+/g, " ").trim(),
        };
      });
      if (read === null || read.busy) return false;
      shown = read.text;
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
  const add = await $(await first('[data-part="add-filter-chip"]'));
  await add.waitForClickable();
  await add.click();
  const fields = await scope("menu", text.filters.picker.fields);
  await press("menuitem", startsWith(text.import.field.Discipline), { within: fields });
  const editor = await scope(
    "dialog",
    fill(text.filters.picker.filterBy, { field: text.import.field.Discipline }),
  );
  const option = await $(await first('[role="option"]', { within: editor }));
  await option.waitForClickable();
  await option.click();
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
