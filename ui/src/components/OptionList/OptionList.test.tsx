import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectNoAxeViolations } from "../../test/axe";
import { SLOW } from "../../test/slow";
import { OptionList, type OptionListProps } from "./OptionList";

const disciplines = [
  { key: "civil", label: "Civil", count: 1515 },
  { key: "piping", label: "Piping", count: 1285 },
  { key: "process", label: "Process", count: 846 },
  { key: "vendor", label: "Vendor", count: 0 },
];

function Held({
  onSelectionChange,
  initial = [],
  ...props
}: Partial<OptionListProps> & { initial?: string[] }) {
  const [keys, setKeys] = useState<readonly string[]>(initial);
  return (
    <OptionList
      aria-label="Discipline values"
      selectionMode="multiple"
      options={disciplines}
      emptyText="No value matches."
      {...props}
      selectedKeys={keys}
      onSelectionChange={(next) => {
        setKeys(next);
        onSelectionChange?.(next);
      }}
    />
  );
}

describe("OptionList", () => {
  it("is a named listbox of options, each named by its label and described by its count", () => {
    render(<Held />);
    const list = screen.getByRole("listbox", { name: "Discipline values" });
    expect(list).toHaveAttribute("aria-multiselectable", "true");
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(4);
    expect(options[0]).toHaveAccessibleName("Civil");
    // The count is written by the format module, with its thousands separated.
    expect(options[0]).toHaveAccessibleDescription("1,515");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("leaves out the count of an option that has none", () => {
    render(<Held options={[{ key: "yes", label: "Yes" }]} />);
    const option = screen.getByRole("option", { name: "Yes" });
    expect(option).toHaveAccessibleDescription("");
    expect(option.querySelector('[data-part="count"]')).toBeNull();
  });

  it(
    "is one stop for Tab; the arrow keys move and Space ticks, reporting the keys",
    SLOW,
    async () => {
      const onSelectionChange = vi.fn();
      const user = userEvent.setup();
      render(
        <>
          <Held onSelectionChange={onSelectionChange} />
          <button type="button">After</button>
        </>,
      );
      await user.tab();
      expect(screen.getByRole("option", { name: "Civil" })).toHaveFocus();
      await user.keyboard(" ");
      expect(onSelectionChange).toHaveBeenLastCalledWith(["civil"]);
      expect(screen.getByRole("option", { name: "Civil" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await user.keyboard("{ArrowDown}{ArrowDown}");
      expect(screen.getByRole("option", { name: "Process" })).toHaveFocus();
      await user.keyboard(" ");
      expect(onSelectionChange).toHaveBeenLastCalledWith(["civil", "process"]);

      // Space on a ticked option unticks it.
      await user.keyboard("{ArrowUp}{ArrowUp}");
      await user.keyboard(" ");
      expect(onSelectionChange).toHaveBeenLastCalledWith(["process"]);
      expect(onSelectionChange).toHaveBeenCalledTimes(3);

      await user.tab();
      expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    },
  );

  it("ticks and unticks on a click", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(<Held onSelectionChange={onSelectionChange} />);
    await user.click(screen.getByRole("option", { name: "Piping" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["piping"]);
    await user.click(screen.getByRole("option", { name: "Civil" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["piping", "civil"]);
    await user.click(screen.getByRole("option", { name: "Piping" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["civil"]);
  });

  it("unticks nothing on Escape, and lets the key go on to what holds the list", async () => {
    const onSelectionChange = vi.fn();
    // What the list lets through reaches the document.
    const passed: string[] = [];
    const listen = (event: KeyboardEvent) => {
      passed.push(event.key);
    };
    document.addEventListener("keydown", listen);
    const user = userEvent.setup();
    render(<Held initial={["civil", "piping"]} onSelectionChange={onSelectionChange} />);
    await user.tab();
    expect(screen.getByRole("option", { name: "Civil" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Civil" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Piping" })).toHaveAttribute("aria-selected", "true");
    expect(passed).toContain("Escape");
    document.removeEventListener("keydown", listen);
  });

  it("holds one value when the choice is single: another replaces it, and the same one clears it", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(<Held selectionMode="single" onSelectionChange={onSelectionChange} />);
    const list = screen.getByRole("listbox", { name: "Discipline values" });
    expect(list).not.toHaveAttribute("aria-multiselectable", "true");
    await user.click(screen.getByRole("option", { name: "Civil" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["civil"]);
    await user.click(screen.getByRole("option", { name: "Piping" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["piping"]);
    expect(screen.getByRole("option", { name: "Civil" })).toHaveAttribute("aria-selected", "false");
    await user.click(screen.getByRole("option", { name: "Piping" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it("shows the mark of its kind of choice on every option", () => {
    const { rerender } = render(<Held initial={["civil"]} />);
    const marks = () =>
      screen.getAllByRole("option").map((option) => option.querySelector('[data-part="mark"]'));
    expect(marks().map((mark) => mark?.getAttribute("data-mark"))).toEqual([
      "box",
      "box",
      "box",
      "box",
    ]);
    rerender(<Held selectionMode="single" initial={["civil"]} />);
    expect(marks().map((mark) => mark?.getAttribute("data-mark"))).toEqual([
      "circle",
      "circle",
      "circle",
      "circle",
    ]);
  });

  it("shows the ticked keys it is given", () => {
    render(<Held initial={["piping", "process"]} />);
    expect(
      screen.getAllByRole("option").map((option) => option.getAttribute("aria-selected")),
    ).toEqual(["false", "true", "true", "false"]);
  });

  it("writes an option with a count of 0 in the muted ink, and lets it be chosen", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(<Held onSelectionChange={onSelectionChange} />);
    const vendor = screen.getByRole("option", { name: "Vendor" });
    expect(vendor).toHaveAttribute("data-zero");
    expect(vendor).toHaveAccessibleDescription("0");
    expect(vendor).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: "Civil" })).not.toHaveAttribute("data-zero");
    await user.click(vendor);
    expect(onSelectionChange).toHaveBeenLastCalledWith(["vendor"]);
  });

  it("says what is absent when it has no option", () => {
    render(<Held options={[]} />);
    const list = screen.getByRole("listbox", { name: "Discipline values" });
    expect(within(list).getByText("No value matches.")).toBeInTheDocument();
    expect(list).not.toHaveAttribute("aria-busy");
  });

  it("on a first read shows that it is loading in place of its options", () => {
    render(<Held options={[]} isLoading />);
    const list = screen.getByRole("listbox", { name: "Discipline values" });
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(within(list).getByText(en.common.loading)).toBeInTheDocument();
    expect(list.querySelector('[data-part="spinner"]')).not.toBeNull();
    expect(screen.queryByText("No value matches.")).not.toBeInTheDocument();
  });

  it("on a re-read keeps its options, marked stale, and they can still be ticked", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(<Held isLoading onSelectionChange={onSelectionChange} />);
    const list = screen.getByRole("listbox", { name: "Discipline values" });
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(list).toHaveAttribute("data-stale");
    expect(within(list).getAllByRole("option")).toHaveLength(4);
    expect(list.querySelector('[data-part="spinner"]')).toBeNull();
    await user.click(screen.getByRole("option", { name: "Civil" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["civil"]);
  });

  it("shows the focus ring on the list itself when it has no option to carry it", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Held options={[]} />);
    const list = screen.getByRole("listbox", { name: "Discipline values" });
    // Without an option the list is the stop for Tab, so the ring has to be its own.
    await user.tab();
    expect(list).toHaveFocus();
    expect(list).toHaveAttribute("data-empty");
    expect(list).toHaveAttribute("data-focus-visible");
    expect(list.className).toContain("list");

    // The same on a first read, where the list holds only the line that says it is loading.
    rerender(<Held options={[]} isLoading />);
    expect(list).toHaveFocus();
    expect(list).toHaveAttribute("data-empty");
    expect(list).toHaveAttribute("data-focus-visible");

    const stylesheet = readFileSync(join(import.meta.dirname, "OptionList.module.css"), "utf8");
    // The ring is drawn for exactly that state, inset, and nothing takes it away again.
    expect(stylesheet).toMatch(
      /\.list\[data-empty\]\[data-focus-visible\]\s*\{[^}]*outline:\s*var\(--focus-ring-width\) solid var\(--color-focus-ring\);[^}]*outline-offset:\s*calc\(-1 \* var\(--focus-ring-width\)\);/,
    );
    // A list with options hands the ring to the option the keyboard is on.
    expect(stylesheet).toMatch(
      /\.list:focus-visible:not\(\[data-empty\]\)\s*\{[^}]*outline-color: transparent;/,
    );
    expect(stylesheet).not.toMatch(/\.list:focus-visible\s*\{/);
  });

  it("with options, gives the ring to the option the keyboard is on, not to the list", async () => {
    const user = userEvent.setup();
    render(<Held />);
    await user.tab();
    const list = screen.getByRole("listbox", { name: "Discipline values" });
    expect(list).not.toHaveAttribute("data-empty");
    expect(screen.getByRole("option", { name: "Civil" })).toHaveAttribute("data-focus-visible");
  });

  it("on a re-read dims the counts only, so every label stays readable while it can be ticked", () => {
    const stylesheet = readFileSync(join(import.meta.dirname, "OptionList.module.css"), "utf8");
    expect(stylesheet).toMatch(
      /\.list\[data-stale\] \.count\s*\{[^}]*opacity: var\(--opacity-stale\);/,
    );
    expect(stylesheet).not.toMatch(/\.list\[data-stale\]\s*\{/);
  });

  it("shows its footer under the list, outside the listbox", () => {
    render(<Held footer="1,300 more values. Type to narrow." />);
    const footer = screen.getByText("1,300 more values. Type to narrow.");
    expect(screen.getByRole("listbox")).not.toContainElement(footer);
  });

  it("has no accessibility violation with options, empty, and loading", SLOW, async () => {
    const { container, rerender } = render(
      <Held initial={["civil"]} footer="1,300 more values. Type to narrow." />,
    );
    await expectNoAxeViolations(container);
    rerender(<Held selectionMode="single" initial={["civil"]} />);
    await expectNoAxeViolations(container);
    rerender(<Held options={[]} />);
    await expectNoAxeViolations(container);
    rerender(<Held options={[]} isLoading />);
    await expectNoAxeViolations(container);
    rerender(<Held isLoading />);
    await expectNoAxeViolations(container);
  });
});
