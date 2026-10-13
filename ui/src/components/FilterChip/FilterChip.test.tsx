import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { AddFilterChip, FilterChip } from "./FilterChip";

const removeDiscipline = en.filterChip.remove.replace("{{field}}", "Discipline");

function setup(props: { isNegated?: boolean; isDisabled?: boolean } = {}) {
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

  it("when disabled, has no remove button, takes no focus, and neither opens nor is removed", async () => {
    const { onPress, onRemove, user } = setup({ isDisabled: true });
    const chip = screen.getByRole("button", { name: "Discipline Civil" });
    expect(chip).toBeDisabled();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    await user.tab();
    expect(document.body).toHaveFocus();
    await user.click(chip);
    chip.focus();
    await user.keyboard("{Backspace}");
    await user.keyboard("{Delete}");
    expect(onPress).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
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
