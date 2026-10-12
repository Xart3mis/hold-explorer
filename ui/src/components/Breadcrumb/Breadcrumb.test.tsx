import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { Breadcrumb } from "./Breadcrumb";

/** What the rules of one selector declare, from the stylesheet of the component. */
function declarations(selector: string): string {
  const css = readFileSync(join(import.meta.dirname, "Breadcrumb.module.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) throw new Error(`The stylesheet has no rule for ${selector}.`);
  return css.slice(at, css.indexOf("}", at));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const long = [
  { label: "Import a holds export from the piping system", onPress: () => undefined },
  { label: "Holds_2026-10-07_unit-573_revision-B.xlsx", onPress: () => undefined },
  { label: "Choose the sheet that holds the report", onPress: () => undefined },
];

describe("Breadcrumb", () => {
  it("renders nothing for a page without ancestors: a trail of one would only repeat the title", () => {
    const { container } = render(<Breadcrumb ancestors={[]} current="Lines" />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("is a named navigation landmark that holds the trail as an ordered list, in order", () => {
    render(
      <Breadcrumb
        ancestors={[
          { label: "Import", onPress: () => undefined },
          { label: "Review", onPress: () => undefined },
        ]}
        current="Map columns"
      />,
    );
    const trail = screen.getByRole("navigation", { name: en.breadcrumb.label });
    const list = within(trail).getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(list).not.toHaveAttribute("aria-label");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Import", "Review", "Map columns"]);
    expect(
      within(trail)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Import", "Review"]);
  });

  it("ends with the current page, which is text and not a link", () => {
    render(
      <Breadcrumb ancestors={[{ label: "Import", onPress: () => undefined }]} current="Review" />,
    );
    const items = screen.getAllByRole("listitem");
    const last = items.at(-1);
    if (!last) throw new Error("The trail has no item.");
    expect(within(last).queryByRole("link")).not.toBeInTheDocument();
    const current = within(last).getByText("Review");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("link", { name: "Import" })).not.toHaveAttribute("aria-current");
  });

  it("puts a separator between two items and hides it from assistive technology", () => {
    render(
      <Breadcrumb
        ancestors={[
          { label: "Import", onPress: () => undefined },
          { label: "Review", onPress: () => undefined },
        ]}
        current="Map columns"
      />,
    );
    const separators = screen.getByRole("navigation").querySelectorAll("svg");
    expect(separators).toHaveLength(2);
    for (const separator of separators) expect(separator).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("listitem").at(-1)?.querySelector("svg")).toBeNull();
  });

  it("opens an ancestor by the keyboard and by the pointer, once each", async () => {
    const toImport = vi.fn();
    const toReview = vi.fn();
    const user = userEvent.setup();
    render(
      <Breadcrumb
        ancestors={[
          { label: "Import", onPress: toImport },
          { label: "Review", onPress: toReview },
        ]}
        current="Map columns"
      />,
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "Import" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(toImport).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(screen.getByRole("link", { name: "Review" })).toHaveFocus();
    await user.click(screen.getByRole("link", { name: "Review" }));
    expect(toReview).toHaveBeenCalledTimes(1);
    expect(toImport).toHaveBeenCalledTimes(1);

    // The current page is not a stop: the next Tab leaves the trail.
    await user.tab();
    expect(screen.getByRole("navigation")).not.toContainElement(
      document.activeElement as HTMLElement | null,
    );
  });

  it("renders an ancestor that has an address as a real link to it", () => {
    render(<Breadcrumb ancestors={[{ label: "Import", href: "/import" }]} current="Review" />);
    expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute("href", "/import");
  });

  it("keeps every item of a long trail, with the current page last and in full", () => {
    render(<Breadcrumb ancestors={long} current="Map the columns of the file to the fields" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items.slice(0, 3).map((item) => item.getAttribute("data-part"))).toEqual([
      "ancestor",
      "ancestor",
      "ancestor",
    ]);
    expect(items[3]).toHaveAttribute("data-part", "current");
    expect(items[3]).toHaveTextContent("Map the columns of the file to the fields");
    for (const ancestor of long) {
      expect(screen.getByRole("link", { name: ancestor.label })).toBeInTheDocument();
    }
  });

  it("stays on one line, cuts the ancestors first, and cuts the current page last", () => {
    expect(declarations(".list")).toMatch(/flex-wrap:\s*nowrap/);
    for (const part of [".link", ".current"]) {
      expect(declarations(part)).toMatch(/text-overflow:\s*ellipsis/);
      expect(declarations(part)).toMatch(/white-space:\s*nowrap/);
      expect(declarations(part)).toMatch(/overflow:\s*hidden/);
    }
    // The ancestors shrink, each down to the room of an ellipsis; the current page does not
    // shrink, and is bounded only by what the ancestors leave of the line.
    expect(declarations('.item[data-part="ancestor"]')).toMatch(/flex-shrink:\s*1;/);
    expect(declarations(".link")).toMatch(/min-inline-size:\s*var\(--space-6\)/);
    expect(declarations('.item[data-part="current"]')).toMatch(/flex-shrink:\s*0;/);
    expect(declarations('.item[data-part="current"]')).toMatch(
      /max-inline-size:\s*calc\(\s*100% - var\(--trail-ancestors\)/,
    );
    // Nothing is ever taken out of the trail.
    expect(declarations(".item")).not.toMatch(/display:\s*none/);
  });

  it("tells the stylesheet how many ancestors the trail has", () => {
    render(<Breadcrumb ancestors={long} current="Map columns" />);
    expect(screen.getByRole("list").style.getPropertyValue("--trail-ancestors")).toBe("3");
  });

  it("shows the full label of an ancestor that was cut in a tooltip, and of no other", async () => {
    // jsdom lays nothing out, so the test says which element is cut: the second ancestor.
    const whole = "Import a holds export from the piping system";
    const cut = "Holds_2026-10-07_unit-573_revision-B.xlsx";
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.textContent === cut ? 240 : 80;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly changed: ResizeObserverCallback) {}
        observe() {
          this.changed([], this);
        }
        unobserve() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      },
    );
    const user = userEvent.setup();
    render(<Breadcrumb ancestors={long} current="Map columns" />);

    await user.tab();
    expect(screen.getByRole("link", { name: whole })).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole("link", { name: cut })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(cut);

    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("has no accessibility violation", async () => {
    const { container } = render(
      <Breadcrumb
        ancestors={[
          { label: "Import", onPress: () => undefined },
          { label: "Review", href: "/import/review" },
        ]}
        current="Map columns"
      />,
    );
    await expectAccessible(container);
  });
});
