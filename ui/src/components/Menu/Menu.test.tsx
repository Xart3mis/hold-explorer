import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectAccessible } from "../../test/axe";
import { SLOW } from "../../test/slow";
import { MenuButton, MenuItem, MenuSection, MenuSeparator, MenuSubmenu } from "./Menu";

function Sample({
  onAction = () => undefined,
  onSelect = () => undefined,
  isPending = false,
  isInert = false,
}: {
  onAction?: (id: string) => void;
  onSelect?: (id: string) => void;
  isPending?: boolean;
  isInert?: boolean;
}) {
  return (
    <MenuButton label="Export" menuLabel="Export options" isPending={isPending} isInert={isInert}>
      <MenuSection title="Format" selectedKey="xlsx" onSelectionChange={onSelect}>
        <MenuItem id="xlsx" detail="Excel workbook">
          xlsx
        </MenuItem>
        <MenuItem id="csv" detail="Text, comma separated">
          csv
        </MenuItem>
      </MenuSection>
      <MenuSeparator />
      <MenuItem
        id="all"
        onAction={() => {
          onAction("all");
        }}
      >
        Export everything
      </MenuItem>
      <MenuItem id="none" isDisabled>
        Export selection
      </MenuItem>
    </MenuButton>
  );
}

describe("MenuButton", () => {
  it("is a button that says it opens a menu", () => {
    render(<Sample />);
    const trigger = screen.getByRole("button", { name: "Export" });
    expect(trigger).toHaveAttribute("aria-haspopup");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("takes another accessible name while it shows its label", () => {
    render(
      <MenuButton
        label="Unit 573 piping"
        aria-label="Workspace Unit 573 piping"
        menuLabel="Workspace"
      >
        <MenuItem id="a">Rename</MenuItem>
      </MenuButton>,
    );
    expect(screen.getByRole("button", { name: "Workspace Unit 573 piping" })).toHaveTextContent(
      "Unit 573 piping",
    );
  });

  it("opens a named menu with its items, a named group, and a separator", async () => {
    const user = userEvent.setup();
    render(<Sample />);
    const trigger = screen.getByRole("button", { name: "Export" });
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Export options" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const group = within(menu).getByRole("group", { name: "Format" });
    const radios = within(group).getAllByRole("menuitemradio");
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(radios[0]).toHaveAccessibleName("xlsx");
    expect(radios[0]).toHaveAccessibleDescription("Excel workbook");
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Export everything" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Export selection" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("runs the action of an item and closes", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<Sample onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Export everything" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("all");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("reports the item chosen in a group that holds a choice", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Sample onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitemradio", { name: "csv" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("csv");
  });

  it("does not report the item that is already chosen", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Sample onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitemradio", { name: "xlsx" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens, moves, chooses, and closes by the keyboard, and gives focus back", SLOW, async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<Sample onAction={onAction} />);
    const trigger = screen.getByRole("button", { name: "Export" });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{End}");
    // The last item is disabled, so the last one that can be chosen has focus.
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Export everything" })).toHaveFocus();
    });
    await user.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledWith("all");
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("is busy and ignores presses while pending, and keeps its label", async () => {
    const user = userEvent.setup();
    render(<Sample isPending />);
    const trigger = screen.getByRole("button", { name: "Export" });
    expect(trigger).toHaveAttribute("aria-busy", "true");
    expect(trigger).toHaveTextContent("Export");
    await user.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows the spinner in place of the chevron while pending", () => {
    render(<Sample isPending />);
    const trigger = screen.getByRole("button", { name: "Export" });
    expect(trigger.querySelectorAll('[data-part="spinner"]')).toHaveLength(1);
    expect(trigger.querySelector("svg")).toBeNull();
  });

  it("says when it is flush with what stands around it, and only then", () => {
    const { unmount } = render(
      <MenuButton label="Open holds" menuLabel="Status" isFlush>
        <MenuItem id="open">Open holds</MenuItem>
      </MenuButton>,
    );
    // The stylesheet moves a flush button out by the padding it gives it, from one place.
    expect(screen.getByRole("button", { name: "Open holds" })).toHaveAttribute("data-flush");
    unmount();

    render(<Sample />);
    expect(screen.getByRole("button", { name: "Export" })).not.toHaveAttribute("data-flush");
  });

  it("when inert, waits for another control: its chevron and no spinner, busy, and its menu stays closed", async () => {
    const user = userEvent.setup();
    render(<Sample isInert />);
    const trigger = screen.getByRole("button", { name: "Export" });
    expect(trigger).toHaveAttribute("aria-busy", "true");
    expect(trigger).toHaveAttribute("data-inert");
    expect(trigger.querySelector('[data-part="spinner"]')).toBeNull();
    expect(trigger.querySelectorAll("svg")).toHaveLength(1);
    expect(trigger).not.toBeDisabled();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("has no accessibility violation, closed and open", SLOW, async () => {
    const user = userEvent.setup();
    render(<Sample />);
    await expectAccessible();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await expectAccessible();
  });
});

/** A menu with an action and a submenu of two actions, as the Export menu of the Overview has. */
function WithSubmenu({ onAction = () => undefined }: { onAction?: (id: string) => void }) {
  return (
    <MenuButton label="Export" menuLabel="Export" align="end">
      <MenuItem
        id="excel"
        onAction={() => {
          onAction("excel");
        }}
      >
        Excel, this view…
      </MenuItem>
      <MenuSubmenu id="png" label="Chart as PNG">
        <MenuItem
          id="png-discipline"
          onAction={() => {
            onAction("discipline");
          }}
        >
          Holds by discipline…
        </MenuItem>
        <MenuItem
          id="png-blockers"
          onAction={() => {
            onAction("blockers");
          }}
        >
          Top blockers…
        </MenuItem>
      </MenuSubmenu>
    </MenuButton>
  );
}

describe("MenuItem with a shortcut", () => {
  it("shows it as its detail and tells assistive technology of it", async () => {
    const user = userEvent.setup();
    render(
      <MenuButton label="Export" menuLabel="Export">
        <MenuItem id="excel" detail="Ctrl+E" keyShortcuts="Control+E">
          Excel, this view…
        </MenuItem>
        <MenuItem id="csv">CSV…</MenuItem>
      </MenuButton>,
    );
    await user.click(screen.getByRole("button", { name: "Export" }));
    const excel = screen.getByRole("menuitem", { name: "Excel, this view…" });
    expect(excel).toHaveAttribute("aria-keyshortcuts", "Control+E");
    expect(excel).toHaveAccessibleDescription("Ctrl+E");
    expect(screen.getByRole("menuitem", { name: "CSV…" })).not.toHaveAttribute("aria-keyshortcuts");
  });
});

describe("MenuSubmenu", () => {
  it("is an item that says it opens a menu, with a chevron", async () => {
    const user = userEvent.setup();
    render(<WithSubmenu />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    const item = screen.getByRole("menuitem", { name: "Chart as PNG" });
    expect(item).toHaveAttribute("aria-haspopup", "menu");
    expect(item).toHaveAttribute("aria-expanded", "false");
    expect(item.querySelectorAll("svg")).toHaveLength(1);
  });

  it("opens by a press and runs the action of its item, then closes every menu", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<WithSubmenu onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Chart as PNG" }));
    const submenu = await screen.findByRole("menu", { name: "Chart as PNG" });
    await user.click(within(submenu).getByRole("menuitem", { name: "Top blockers…" }));
    expect(onAction).toHaveBeenCalledWith("blockers");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("opens, closes, and chooses by the keyboard, and gives focus back", SLOW, async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<WithSubmenu onAction={onAction} />);
    const trigger = screen.getByRole("button", { name: "Export" });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    const item = screen.getByRole("menuitem", { name: "Chart as PNG" });
    await waitFor(() => {
      expect(item).toHaveFocus();
    });
    await user.keyboard("{ArrowRight}");
    const submenu = await screen.findByRole("menu", { name: "Chart as PNG" });
    expect(item).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => {
      expect(within(submenu).getByRole("menuitem", { name: "Holds by discipline…" })).toHaveFocus();
    });
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Chart as PNG" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(item).toHaveFocus();
    });
    await user.keyboard("{Enter}");
    const again = await screen.findByRole("menu", { name: "Chart as PNG" });
    await waitFor(() => {
      expect(within(again).getByRole("menuitem", { name: "Holds by discipline…" })).toHaveFocus();
    });
    await user.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledWith("discipline");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("has no accessibility violation with the submenu open", SLOW, async () => {
    const user = userEvent.setup();
    render(<WithSubmenu />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Chart as PNG" }));
    await screen.findByRole("menu", { name: "Chart as PNG" });
    await expectAccessible();
  });
});
