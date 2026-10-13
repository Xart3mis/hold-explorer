import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Download, X } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { expectAccessible } from "../../test/axe";
import { Button, IconButton } from "./Button";

const variants = ["primary", "secondary", "quiet", "danger"] as const;

describe("Button", () => {
  it("renders with its label as its accessible name", () => {
    render(<Button>Import</Button>);
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("is secondary unless a variant is given", () => {
    render(
      <>
        <Button>Export</Button>
        <Button variant="primary">Import</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Export" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(screen.getByRole("button", { name: "Import" })).toHaveAttribute(
      "data-variant",
      "primary",
    );
  });

  it("is reached by Tab and activated by Enter, by Space, and by a click", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(<Button onPress={onPress}>Import</Button>);
    const button = screen.getByRole("button", { name: "Import" });

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(button);
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it("keeps the icon out of the accessible name", () => {
    render(<Button icon={Download}>Export</Button>);
    const button = screen.getByRole("button", { name: "Export" });
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("when disabled, cannot be focused or activated", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <Button isDisabled onPress={onPress}>
        Import
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Import" });
    expect(button).toBeDisabled();

    await user.tab();
    expect(button).not.toHaveFocus();
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("when pending, keeps its label, says it is busy, and ignores presses", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <Button reservesPendingSpace isPending onPress={onPress}>
        Import
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Import" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("Import");
    expect(button.querySelector('[data-part="spinner"]')).not.toBeNull();

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("when inert, waits for another control: no spinner, its icon and its look kept, busy, and deaf to presses", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Button icon={Download} isPending={false} isInert onPress={onPress}>
        Export
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Export" });
    // It says that it waits, and it is not the one that shows what runs. To assistive technology
    // it is unavailable and busy, as DESIGN.md says of a control that waits for another.
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("data-inert");
    expect(button.querySelector('[data-part="spinner"]')).toBeNull();
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    // It is not disabled: it keeps its look and its place in the Tab order.
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute("data-disabled");
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
    await user.hover(button);
    expect(button).not.toHaveAttribute("data-hovered");

    // The control that started the action shows the spinner, whatever else is said of it.
    rerender(
      <Button icon={Download} isPending isInert onPress={onPress}>
        Export
      </Button>,
    );
    expect(button.querySelectorAll('[data-part="spinner"]')).toHaveLength(1);
    expect(button).not.toHaveAttribute("data-inert");

    rerender(
      <Button icon={Download} isPending={false} onPress={onPress}>
        Export
      </Button>,
    );
    expect(button).not.toHaveAttribute("aria-busy");
    await user.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps the room of the spinner while inert, so its width is the one at rest", () => {
    const { rerender } = render(<Button reservesPendingSpace>Open</Button>);
    const button = screen.getByRole("button", { name: "Open" });
    const stylesheet = readFileSync(join(import.meta.dirname, "Button.module.css"), "utf8");
    // The room is kept wherever no spinner fills it: at rest, and while inert.
    expect(stylesheet).toMatch(
      /\.button\[data-reserve\]:not\(\[data-pending\]\) \.label,\s*\.button\[data-reserve\]\[data-inert\] \.label\s*\{/,
    );
    rerender(
      <Button reservesPendingSpace isInert>
        Open
      </Button>,
    );
    expect(button).toHaveAttribute("data-reserve");
    expect(button).toHaveAttribute("data-inert");
    expect(button.querySelector('[data-part="spinner"]')).toBeNull();
  });

  it("when pending, shows the spinner in place of the leading icon", () => {
    const { rerender } = render(<Button icon={Download}>Export</Button>);
    const button = screen.getByRole("button", { name: "Export" });
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    expect(button).not.toHaveAttribute("aria-busy");

    rerender(
      <Button icon={Download} isPending>
        Export
      </Button>,
    );
    expect(button.querySelectorAll("svg")).toHaveLength(0);
    expect(button.querySelectorAll('[data-part="spinner"]')).toHaveLength(1);
  });

  it("reserves the room of the spinner when it is asked to and has no icon", () => {
    const { rerender } = render(<Button reservesPendingSpace>Import</Button>);
    const button = screen.getByRole("button", { name: "Import" });
    expect(button).toHaveAttribute("data-reserve");

    rerender(<Button>Import</Button>);
    expect(button).not.toHaveAttribute("data-reserve");
  });

  it("reserves no room when it says that it keeps none, pending or not", () => {
    const { rerender } = render(
      <Button reservesPendingSpace={false} isPending={false}>
        Import
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Import" });
    expect(button).not.toHaveAttribute("data-reserve");

    rerender(
      <Button reservesPendingSpace={false} isPending>
        Import
      </Button>,
    );
    expect(button).not.toHaveAttribute("data-reserve");
    expect(button.querySelectorAll('[data-part="spinner"]')).toHaveLength(1);
  });

  it("reserves no room when it has an icon: the spinner takes the place of the icon", () => {
    render(
      <Button reservesPendingSpace icon={Download}>
        Export
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Export" })).not.toHaveAttribute("data-reserve");
  });

  it("carries the same width mark at rest and while pending, so its width cannot change", () => {
    const { rerender } = render(
      <Button reservesPendingSpace isPending={false}>
        Import
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Import" });
    const atRest = { reserve: button.getAttribute("data-reserve"), classes: button.className };
    expect(atRest.reserve).not.toBeNull();

    rerender(
      <Button reservesPendingSpace isPending>
        Import
      </Button>,
    );
    expect(button).toHaveAttribute("aria-busy", "true");
    expect({ reserve: button.getAttribute("data-reserve"), classes: button.className }).toEqual(
      atRest,
    );

    rerender(
      <Button reservesPendingSpace isPending={false}>
        Import
      </Button>,
    );
    expect({ reserve: button.getAttribute("data-reserve"), classes: button.className }).toEqual(
      atRest,
    );
  });

  it.each(variants)(
    "has no accessibility violation as a %s button in any state",
    async (variant) => {
      const { container } = render(
        <>
          <Button variant={variant}>Default</Button>
          <Button variant={variant} icon={Download}>
            With icon
          </Button>
          <Button variant={variant} isDisabled>
            Disabled
          </Button>
          <Button variant={variant} reservesPendingSpace isPending>
            Pending
          </Button>
        </>,
      );
      await expectAccessible(container);
    },
  );
});

describe("IconButton", () => {
  it("takes its label as its accessible name", () => {
    render(<IconButton icon={X} label="Dismiss" />);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("shows its label as a tooltip on keyboard focus, and Escape hides it", async () => {
    const user = userEvent.setup();
    render(<IconButton icon={X} label="Dismiss" />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Dismiss");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
  });

  it("is activated by the keyboard, and blocked when disabled", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<IconButton icon={X} label="Dismiss" onPress={onPress} />);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<IconButton icon={X} label="Dismiss" onPress={onPress} isDisabled />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violation, at rest and with its tooltip open", async () => {
    const user = userEvent.setup();
    render(<IconButton icon={X} label="Dismiss" />);
    await expectAccessible();
    await user.tab();
    await screen.findByRole("tooltip");
    await expectAccessible();
  });
});
