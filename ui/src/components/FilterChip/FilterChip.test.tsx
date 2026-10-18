import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import i18n from "../../text/i18n";
import { AddFilterChip, FilterChip } from "./FilterChip";

const removeDiscipline = en.filterChip.remove.replace("{{field}}", "Discipline");

function setup(
  props: {
    isNegated?: boolean;
    isDisabled?: boolean;
    isUnderPopover?: boolean;
    isInactive?: boolean;
  } = {},
) {
  const onPress = vi.fn();
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(
    <FilterChip
      field="Discipline"
      value="Civil"
      onPress={onPress}
      onRemove={onRemove}
      {...props}
    />,
  );
  return { onPress, onRemove, user };
}

describe("FilterChip", () => {
  it("is a button named by its field and its value, with a button that removes it", () => {
    setup();
    expect(screen.getByRole("button", { name: "Discipline Civil" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: removeDiscipline })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("says in its name that its filter is not in this snapshot, shows its field and value, and can still be opened and removed", async () => {
    const { onPress, onRemove, user } = setup({ isInactive: true });
    const name = `Discipline Civil ${en.filterChip.notInSnapshot}`;
    const body = screen.getByRole("button", { name });
    const pill = body.closest<HTMLElement>("[data-part='filter-chip']");
    if (pill === null) throw new Error("The chip holds its button.");
    expect(pill).toHaveAttribute("data-inactive");
    // No tag takes the room of the value: a small icon says it, hidden from assistive technology.
    expect(pill.querySelector("[data-part='tag']")).toBeNull();
    expect(pill.querySelector("[data-part='filter-chip-inactive']")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(body).toBeEnabled();
    await user.click(body);
    expect(onPress).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: removeDiscipline }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    await expectAccessible();
  });

  it("reads a negated filter as is not", () => {
    setup({ isNegated: true });
    expect(screen.getByRole("button", { name: "Discipline is not Civil" })).toBeInTheDocument();
  });

  it("opens its filter on Enter, on Space, and on a click", async () => {
    const { onPress, onRemove, user } = setup();
    const chip = screen.getByRole("button", { name: "Discipline Civil" });
    await user.tab();
    expect(chip).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(chip);
    expect(onPress).toHaveBeenCalledTimes(3);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("is removed by Backspace and by Delete while it has the focus", async () => {
    const { onPress, onRemove, user } = setup();
    await user.tab();
    await user.keyboard("{Backspace}");
    expect(onRemove).toHaveBeenCalledTimes(1);
    await user.keyboard("{Delete}");
    expect(onRemove).toHaveBeenCalledTimes(2);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("is removed by its remove button, by a click and by the keyboard, and that does not open it", async () => {
    const { onPress, onRemove, user } = setup();
    const remove = screen.getByRole("button", { name: removeDiscipline });
    await user.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);

    // The remove button is the stop after the chip.
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Discipline Civil" })).toHaveFocus();
    await user.tab();
    expect(remove).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledTimes(2);
    await user.keyboard(" ");
    expect(onRemove).toHaveBeenCalledTimes(3);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("names what its remove button removes in a tooltip as well", async () => {
    const { user } = setup();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: removeDiscipline })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(removeDiscipline);
  });

  it("has no tooltip on its remove button while a popover of the screen is open over it, and still removes", async () => {
    const { onRemove, user } = setup({ isUnderPopover: true });
    await user.tab();
    await user.tab();
    const remove = screen.getByRole("button", { name: removeDiscipline });
    expect(remove).toHaveFocus();
    // Keyboard focus shows a tooltip at once; there is none.
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.keyboard("{Delete}");
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("when disabled, has no remove button, takes no focus, and neither opens nor is removed", async () => {
    const { onPress, onRemove, user } = setup({ isDisabled: true });
    const chip = screen.getByRole("button", { name: "Discipline Civil" });
    expect(chip).toBeDisabled();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    await user.tab();
    expect(document.body).toHaveFocus();
    await user.click(chip);
    // A disabled button cannot be focused, so the keys are sent to it directly.
    for (const key of ["Backspace", "Delete", "Enter", " "]) {
      fireEvent.keyDown(chip, { key });
      fireEvent.keyUp(chip, { key });
    }
    expect(onPress).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("when disabled, keeps the X where it was, as a picture, so the chip is as wide as it was", () => {
    const { unmount } = render(
      <FilterChip
        field="Discipline"
        value="Civil"
        onPress={() => undefined}
        onRemove={() => undefined}
      />,
    );
    // What gives the remove button its circle, as wide as the chip is tall.
    const circle = screen.getByRole("button", { name: removeDiscipline }).className;
    expect(circle).not.toBe("");
    expect(document.querySelector("[data-part='filter-chip-x']")).toBeNull();
    unmount();

    setup({ isDisabled: true });
    const kept = document.querySelector("[data-part='filter-chip-x']");
    expect(kept).not.toBeNull();
    expect(kept?.className).toBe(circle);
    expect(kept?.querySelector("svg")).not.toBeNull();
    // It is a picture: no control, and nothing for assistive technology.
    expect(kept?.tagName).toBe("SPAN");
    expect(kept).toHaveAttribute("aria-hidden", "true");
    expect(kept).not.toHaveAttribute("tabindex");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("is removed by Backspace and by Delete while its remove button has the focus as well", async () => {
    const { onPress, onRemove, user } = setup();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: removeDiscipline })).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(onRemove).toHaveBeenCalledTimes(1);
    await user.keyboard("{Delete}");
    expect(onRemove).toHaveBeenCalledTimes(2);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("reads the sentence of the catalog in the order the catalog gives it", () => {
    // A translation may put the value, or the words that negate it, before the field.
    const sentence = en.filterChip.isNot;
    i18n.addResource("en", "translation", "filterChip.isNot", "not {{value}} in {{field}}");
    try {
      setup({ isNegated: true });
      const chip = screen.getByRole("button", { name: "not Civil in Discipline" });
      // The field keeps its own ink wherever it stands, and the rest reads as the value.
      const field = screen.getByText("Discipline");
      expect(chip).toContainElement(field);
      expect(field.tagName).toBe("SPAN");
      expect(field.className).toContain("field");
      expect(field.parentElement?.textContent).toBe("not Civil in Discipline");
      expect(field.parentElement?.childNodes).toHaveLength(4);
    } finally {
      i18n.addResource("en", "translation", "filterChip.isNot", sentence);
    }
  });

  it("has no accessibility violation at rest, negated, and disabled", async () => {
    const { container } = render(
      <>
        <FilterChip
          field="Discipline"
          value="Civil, Piping"
          onPress={() => undefined}
          onRemove={() => undefined}
        />
        <FilterChip
          field="Hold type"
          value="Vendor"
          isNegated
          onPress={() => undefined}
          onRemove={() => undefined}
        />
        <FilterChip
          field="Role"
          value="Lead"
          isDisabled
          onPress={() => undefined}
          onRemove={() => undefined}
        />
      </>,
    );
    await expectAccessible(container);
  });
});

describe("AddFilterChip", () => {
  it("is a button named Add filter that is pressed by the keyboard and by a click", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(<AddFilterChip onPress={onPress} />);
    const add = screen.getByRole("button", { name: en.filterChip.add });
    await user.tab();
    expect(add).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(add);
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it("when disabled, takes no focus and no press", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(<AddFilterChip onPress={onPress} isDisabled />);
    const add = screen.getByRole("button", { name: en.filterChip.add });
    expect(add).toBeDisabled();
    await user.tab();
    expect(document.body).toHaveFocus();
    await user.click(add);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("has no accessibility violation, enabled and disabled", async () => {
    const { container } = render(
      <>
        <AddFilterChip onPress={() => undefined} />
        <AddFilterChip onPress={() => undefined} isDisabled />
      </>,
    );
    await expectAccessible(container);
  });
});
