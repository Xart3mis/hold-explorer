import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { Button } from "../Button/Button";
import { FactList } from "./FactList";

describe("FactList", () => {
  it("is a named list whose items read their label and then their value", () => {
    render(
      <FactList
        aria-label="File facts"
        items={[
          { label: "File", value: "Holds_2026-10-14.xlsx", kind: "identifier" },
          { label: "Sheet", value: "data" },
          { label: "Project number", value: "5359-200" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "File facts" });
    const items = within(list).getAllByRole("listitem");
    // The roles are written out: a list drawn without its markers loses them in some engines.
    expect(list).toHaveAttribute("role", "list");
    for (const item of items) expect(item).toHaveAttribute("role", "listitem");
    // The label first, then the value, each in a part of its own.
    expect(items.map((item) => [...item.children].map((part) => part.textContent))).toEqual([
      ["File", "Holds_2026-10-14.xlsx"],
      ["Sheet", "data"],
      ["Project number", "5359-200"],
    ]);
  });

  it("keeps two rows of the same label apart", () => {
    // An export may name two columns alike, and the panel lists such columns by their header.
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { rerender } = render(
      <FactList
        aria-label="Other columns"
        items={[
          { label: "Remark", value: "first" },
          { label: "Remark", value: "second" },
        ]}
      />,
    );
    const values = () =>
      within(screen.getByRole("list", { name: "Other columns" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent);
    expect(values()).toEqual(["Remarkfirst", "Remarksecond"]);
    rerender(
      <FactList
        aria-label="Other columns"
        items={[
          { label: "Remark", value: "second" },
          { label: "Remark", value: "third" },
        ]}
      />,
    );
    expect(values()).toEqual(["Remarksecond", "Remarkthird"]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("marks an identifier, so it is written as the source wrote it", () => {
    render(
      <FactList
        aria-label="Line facts"
        items={[
          { label: "Line", value: "78B01-573-4434-FW-001", kind: "identifier" },
          { label: "Discipline", value: "Civil" },
        ]}
      />,
    );
    expect(screen.getByText("78B01-573-4434-FW-001")).toHaveAttribute("data-kind", "identifier");
    expect(screen.getByText("Civil")).not.toHaveAttribute("data-kind");
  });

  it("marks a value that is absent, in words", () => {
    render(
      <FactList
        aria-label="File facts"
        items={[{ label: "Project number", value: "None in the file", isAbsent: true }]}
      />,
    );
    expect(screen.getByText("None in the file")).toHaveAttribute("data-absent");
  });

  it("puts the action of a row at its end, where the keyboard reaches it", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <FactList
        aria-label="File facts"
        items={[
          {
            label: "Sheet",
            value: "data",
            action: (
              <Button variant="quiet" onPress={onPress}>
                Choose another sheet
              </Button>
            ),
          },
        ]}
      />,
    );
    const item = screen.getByRole("listitem");
    await user.tab();
    expect(within(item).getByRole("button", { name: "Choose another sheet" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is not a control: without an action the keyboard passes it by", async () => {
    const user = userEvent.setup();
    render(<FactList aria-label="File facts" items={[{ label: "Sheet", value: "data" }]} />);
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it("on a first load keeps the labels, shows a block for each value, and says it is loading", () => {
    render(
      <FactList
        aria-label="Line facts"
        isLoading
        items={[
          { label: "Model size", value: '6"' },
          { label: "LDT size", value: '6"' },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Line facts" });
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(within(list).getByText("Model size")).toBeInTheDocument();
    expect(within(list).queryByText('6"')).not.toBeInTheDocument();
    expect(list.querySelectorAll('[data-part="skeleton"]')).toHaveLength(2);
    expect(within(list).getByText(en.common.loading)).toBeInTheDocument();
  });

  it("has no accessibility violation, loaded and loading", async () => {
    const items = [
      { label: "File", value: "Holds_2026-10-14.xlsx", kind: "identifier" as const },
      { label: "Project number", value: "None in the file", isAbsent: true },
    ];
    const { container, rerender } = render(<FactList aria-label="File facts" items={items} />);
    await expectAccessible(container);
    rerender(<FactList aria-label="File facts" items={items} isLoading />);
    await expectAccessible(container);
  });
});
