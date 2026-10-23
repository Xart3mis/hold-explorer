import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectNoAxeViolations } from "../../test/axe";
import { Button } from "../Button/Button";
import { Notice } from "./Notice";

const tones = ["info", "success", "warning", "danger"] as const;

describe("Notice", () => {
  it("shows its title and its message", () => {
    render(
      <Notice tone="warning" title="12 rows were skipped.">
        Their line ID is blank.
      </Notice>,
    );
    const notice = screen.getByRole("status");
    expect(within(notice).getByText("12 rows were skipped.")).toBeInTheDocument();
    expect(within(notice).getByText("Their line ID is blank.")).toBeInTheDocument();
  });

  it("announces a danger notice at once and the other tones politely", () => {
    render(
      <>
        <Notice tone="danger">The file could not be read.</Notice>
        <Notice tone="info">You are viewing an older snapshot.</Notice>
        <Notice tone="success">Snapshot imported.</Notice>
        <Notice tone="warning">12 rows were skipped.</Notice>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The file could not be read.");
    expect(screen.getAllByRole("status")).toHaveLength(3);
  });

  it.each(tones)("pairs the %s tone with an icon, never a color alone", (tone) => {
    render(<Notice tone={tone}>Message</Notice>);
    const notice = screen.getByRole(tone === "danger" ? "alert" : "status");
    expect(notice).toHaveAttribute("data-tone", tone);
    expect(notice.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("holds actions that are reached and activated by the keyboard", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <Notice
        tone="warning"
        title="12 rows were skipped."
        actions={
          <Button variant="quiet" onPress={onPress}>
            Show rows
          </Button>
        }
      >
        Their line ID is blank.
      </Notice>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Show rows" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("has a close button only when it can be dismissed", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Notice tone="info">An update is available.</Notice>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <Notice tone="info" onDismiss={onDismiss}>
        An update is available.
      </Notice>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: en.common.dismiss })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it.each(tones)("has no accessibility violation as a %s notice", async (tone) => {
    const { container } = render(
      <Notice
        tone={tone}
        title="12 rows were skipped."
        actions={<Button variant="quiet">Show rows</Button>}
        onDismiss={() => undefined}
      >
        Their line ID is blank.
      </Notice>,
    );
    await expectNoAxeViolations(container);
  });
});
