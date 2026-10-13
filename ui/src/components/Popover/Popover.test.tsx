import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { SLOW } from "../../test/slow";
import { Button } from "../Button/Button";
import { Checkbox } from "../Checkbox/Checkbox";
import { ChoiceGroup } from "../ChoiceGroup/ChoiceGroup";
import { AddFilterChip, FilterChip } from "../FilterChip/FilterChip";
import { TextField } from "../TextField/TextField";
import { Popover } from "./Popover";

function Sample() {
  return (
    <Popover trigger={<Button>Filter</Button>} aria-label="Filter by discipline">
      <p>Values of the discipline</p>
      <Button variant="quiet">Clear</Button>
    </Popover>
  );
}

describe("Popover", () => {
  it("shows its trigger, which says that it opens something and that it is closed", () => {
    render(<Sample />);
    const trigger = screen.getByRole("button", { name: "Filter" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a named dialog on a press and takes the focus into it", async () => {
    const user = userEvent.setup();
    render(<Sample />);
    const trigger = screen.getByRole("button", { name: "Filter" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Filter by discipline" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByText("Values of the discipline")).toBeVisible();
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it(
    "opens by the keyboard, closes on Escape, and gives the focus back to its trigger",
    SLOW,
    async () => {
      const user = userEvent.setup();
      render(<Sample />);
      const trigger = screen.getByRole("button", { name: "Filter" });
      await user.tab();
      expect(trigger).toHaveFocus();
      await user.keyboard("{Enter}");
      const dialog = screen.getByRole("dialog", { name: "Filter by discipline" });
      await waitFor(() => {
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
      });

      // Tab moves through what it holds, and stays inside.
      await user.tab();
      expect(within(dialog).getByRole("button", { name: "Clear" })).toHaveFocus();
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);

      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(trigger).toHaveFocus();
      });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    },
  );

  it("gives the focus to the first field it holds, and to itself when it holds none", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Popover trigger={<AddFilterChip onPress={() => undefined} />} aria-label="Add a filter">
        <Button variant="quiet">Clear</Button>
        <TextField label="Search discipline" />
        <TextField label="Another field" />
      </Popover>,
    );
    await user.click(screen.getByRole("button", { name: en.filterChip.add }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Search discipline" })).toHaveFocus();
    });
    unmount();

    render(<Sample />);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    const dialog = screen.getByRole("dialog", { name: "Filter by discipline" });
    await waitFor(() => {
      expect(dialog).toHaveFocus();
    });
  });

  it("takes a field to be where text is typed: a choice or a checkbox before it does not take the focus", async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<Button>Filter</Button>} aria-label="Filter by discipline">
        <ChoiceGroup
          label="Match"
          value="is"
          onChange={() => undefined}
          options={[
            { value: "is", label: "Is" },
            { value: "is-not", label: "Is not" },
          ]}
        />
        <Checkbox>Only open holds</Checkbox>
        <input type="hidden" name="field" value="discipline" />
        <TextField label="Search discipline" />
      </Popover>,
    );
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Search discipline" })).toHaveFocus();
    });
  });

  it("keeps the focus on itself when it holds controls and no field to type in", async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<Button>Filter</Button>} aria-label="Filter by match">
        <ChoiceGroup
          label="Match"
          value="is"
          onChange={() => undefined}
          options={[
            { value: "is", label: "Is" },
            { value: "is-not", label: "Is not" },
          ]}
        />
      </Popover>,
    );
    await user.click(screen.getByRole("button", { name: "Filter" }));
    const dialog = screen.getByRole("dialog", { name: "Filter by match" });
    await waitFor(() => {
      expect(dialog).toHaveFocus();
    });
  });

  it("hands what it holds a way to close it", async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<Button>Filter</Button>} aria-label="Filter by text">
        {(close) => (
          <Button variant="quiet" onPress={close}>
            Done
          </Button>
        )}
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "Filter" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("is opened by a filter chip, and not by the button that removes the chip", async () => {
    const onPress = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <Popover
        trigger={
          <FilterChip field="Discipline" value="Civil" onPress={onPress} onRemove={onRemove} />
        }
        aria-label="Filter by discipline"
      >
        <p>Values of the discipline</p>
      </Popover>,
    );
    await user.click(
      screen.getByRole("button", { name: en.filterChip.remove.replace("{{field}}", "Discipline") }),
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const chip = screen.getByRole("button", { name: "Discipline Civil" });
    await user.click(chip);
    expect(screen.getByRole("dialog", { name: "Filter by discipline" })).toBeInTheDocument();
    // The chip says what it was pressed for as well as opening its filter.
    expect(onPress).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(chip).toHaveFocus();
    });
  });

  it("can be held open and closed by the screen", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Popover
        trigger={<Button>Filter</Button>}
        aria-label="Filter by discipline"
        isOpen={false}
        onOpenChange={onOpenChange}
      >
        <p>Values</p>
      </Popover>,
    );
    await user.click(screen.getByRole("button", { name: "Filter" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(
      <Popover
        trigger={<Button>Filter</Button>}
        aria-label="Filter by discipline"
        isOpen
        onOpenChange={onOpenChange}
      >
        <p>Values</p>
      </Popover>,
    );
    expect(screen.getByRole("dialog", { name: "Filter by discipline" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("has no accessibility violation, closed and open", SLOW, async () => {
    const user = userEvent.setup();
    render(<Sample />);
    await expectAccessible();
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await screen.findByRole("dialog");
    await expectAccessible();
  });
});
