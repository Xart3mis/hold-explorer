import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import { renderApp } from "../../test/app";
import { expectNoAxeViolations } from "../../test/axe";
import { openStart, startState } from "../../test/fixtures";
import { t } from "../../text/i18n";
import { SHORTCUTS } from "./shortcuts";

const words = en.shortcuts;

const sheet = () => screen.findByRole("dialog", { name: words.title });
const closedSheet = () => screen.queryByRole("dialog", { name: words.title });
const searchField = () => screen.findByRole("combobox", { name: en.search.label });

function renderSheet(path = "/overview") {
  return renderApp({ start: openStart(), path });
}

async function openSheet(user: ReturnType<typeof renderApp>["user"]) {
  await searchField();
  await user.keyboard("?");
  return sheet();
}

describe("opening", () => {
  it("opens on ? typed on the page, with Shift or without", async () => {
    const { user } = renderSheet();
    await searchField();
    await user.keyboard("{Shift>}?{/Shift}");
    await sheet();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(closedSheet()).toBeNull();
    });
    await user.keyboard("?");
    await sheet();
  });

  it("does not open in a text field, where ? is text", async () => {
    const { user } = renderSheet();
    const field = await searchField();
    await user.click(field);
    await user.keyboard("a?");
    expect(closedSheet()).toBeNull();
    expect(field).toHaveValue("a?");
  });

  it("opens from the command palette's Keyboard shortcuts item", async () => {
    const { user } = renderSheet();
    await searchField();
    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: en.palette.name });
    await user.keyboard("keyboard shortcuts");
    const option = await within(palette).findByRole("option", {
      name: new RegExp(en.palette.shortcuts),
    });
    expect(option).toHaveAttribute("aria-keyshortcuts", "?");
    await user.keyboard("{Enter}");
    await sheet();
    expect(screen.queryByRole("dialog", { name: en.palette.name })).toBeNull();
  });
});

describe("/", () => {
  it("moves the focus to the search field", async () => {
    const { user } = renderSheet();
    const field = await searchField();
    await user.keyboard("/");
    expect(field).toHaveFocus();
    // The slash is the shortcut, not text.
    expect(field).toHaveValue("");
  });

  it("is text in a text field", async () => {
    const { user } = renderSheet();
    const field = await searchField();
    await user.click(field);
    await user.keyboard("a/b");
    expect(field).toHaveValue("a/b");
  });

  it("does nothing under the sheet", async () => {
    const { user } = renderSheet();
    const field = await searchField();
    await openSheet(user);
    await user.keyboard("/");
    expect(field).not.toHaveFocus();
  });
});

describe("the sheet", () => {
  it("lists every entry of the registry, group by group, and nothing else", async () => {
    const { user } = renderSheet();
    const dialog = await openSheet(user);
    const sections = within(dialog)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => {
        const section = heading.closest("section");
        if (section === null) throw new Error("A heading is outside its group.");
        return section;
      });
    expect(sections.map((section) => within(section).getByRole("heading").textContent)).toEqual([
      words.group.go,
      words.group.actions,
      words.group.tables,
      words.group.panel,
    ]);
    const groups = ["go", "actions", "tables", "panel"] as const;
    groups.forEach((group, index) => {
      const section = sections[index];
      if (section === undefined) throw new Error("A group is missing.");
      const shown = within(section)
        .getAllByRole("listitem")
        .map((row) => row.querySelector("span")?.textContent);
      const wanted = SHORTCUTS.filter((entry) => entry.group === group).map((entry) =>
        t(entry.label),
      );
      expect(shown).toEqual(wanted);
    });
  });

  it("draws the keys as key caps", async () => {
    const { user } = renderSheet();
    const dialog = await openSheet(user);
    const rows = within(dialog).getAllByRole("listitem");
    const at = SHORTCUTS.findIndex((entry) => entry.shortcut === "Ctrl+1");
    const row = rows[at];
    if (row === undefined) throw new Error("The row of Ctrl+1 is missing.");
    const caps = Array.from(row.querySelectorAll("kbd kbd")).map((cap) => cap.textContent);
    expect(caps).toEqual(["Ctrl", "1"]);
    // Read as one shortcut, not as separate caps.
    expect(row).toHaveTextContent("Control plus 1");
  });

  it("is a modal: another shortcut holds back while it is open", async () => {
    const { user, router } = renderSheet("/overview");
    await openSheet(user);
    await user.keyboard("{Control>}3{/Control}");
    expect(router.state.location.pathname).toBe("/overview");
  });

  it("closes on Escape and on the Close button, and gives the focus back", async () => {
    const { user } = renderSheet();
    const link = await screen.findByRole("link", { name: en.destinations.name.breakdown });
    link.focus();
    await user.keyboard("?");
    const dialog = await sheet();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(closedSheet()).toBeNull();
    });
    await waitFor(() => {
      expect(link).toHaveFocus();
    });
    await user.keyboard("?");
    await user.click(within(await sheet()).getByRole("button", { name: words.close }));
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(link).toHaveFocus();
    });
  });

  it("gives way to the command palette on Ctrl+K, so the modals never stack", async () => {
    const { user } = renderSheet();
    await openSheet(user);
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: en.palette.name });
    await waitFor(() => {
      expect(closedSheet()).toBeNull();
    });
  });

  it("has no accessibility violations", async () => {
    const { user } = renderSheet();
    await openSheet(user);
    await expectNoAxeViolations();
  });
});

describe("the keys of the shell", () => {
  it("does not take the slash from the page where there is no search field", async () => {
    renderApp({ start: startState(), path: "/settings" });
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.settings });
    expect(screen.queryByRole("combobox", { name: en.search.label })).toBeNull();
    const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("takes the slash where the search field is", async () => {
    renderSheet();
    await searchField();
    const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not open the sheet under a menu", async () => {
    const { user } = renderSheet();
    await searchField();
    await user.click(await screen.findByRole("button", { name: en.export.menu.label }));
    await screen.findByRole("menu");
    await user.keyboard("?");
    expect(closedSheet()).toBeNull();
  });

  it("does not open the sheet under the palette, where ? is text", async () => {
    const { user } = renderSheet();
    await searchField();
    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: en.palette.name });
    await user.keyboard("?");
    expect(closedSheet()).toBeNull();
    expect(within(palette).getByRole("textbox")).toHaveValue("?");
  });

  it("gives the focus back to the control it was on, across both modals", async () => {
    const { user } = renderSheet();
    const link = await screen.findByRole("link", { name: en.destinations.name.breakdown });
    link.focus();
    // The palette's item opens the sheet; Escape closes it.
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: en.palette.name });
    await user.keyboard("keyboard shortcuts{Enter}");
    await sheet();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(closedSheet()).toBeNull();
    });
    await waitFor(() => {
      expect(link).toHaveFocus();
    });
    // The sheet gives way to the palette on Ctrl+K; Escape closes that.
    await user.keyboard("?");
    await sheet();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: en.palette.name });
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: en.palette.name })).toBeNull();
    });
    await waitFor(() => {
      expect(link).toHaveFocus();
    });
  });
});

describe("motion", () => {
  it("fades in place under reduced motion, as the palette does", () => {
    const css = readFileSync(join(__dirname, "ShortcutSheet.module.css"), "utf8");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.modal\[data-entering\] \{\s*transform: none;/,
    );
  });
});
