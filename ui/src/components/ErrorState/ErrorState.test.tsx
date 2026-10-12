import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CommandError } from "../../bindings/CommandError";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { ErrorState } from "./ErrorState";

const error: CommandError = {
  kind: "NewerSchema",
  message:
    "This workspace was written by a newer version of Hold Explorer. It was not changed. Install the newer version to open it.",
};

describe("ErrorState", () => {
  it("is announced at once, with a heading from the catalog and the message as it is", () => {
    render(<ErrorState error={error} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(en.errorState.title);
    expect(alert).toHaveTextContent(error.message);
    expect(alert).toHaveAttribute("data-tone", "danger");
    expect(alert.closest("[data-kind]")).toHaveAttribute("data-kind", "NewerSchema");
  });

  it("takes a heading that says what failed on this screen", () => {
    render(<ErrorState error={error} title="The workspace could not be opened" />);
    expect(screen.getByRole("alert")).toHaveTextContent("The workspace could not be opened");
    expect(screen.getByRole("alert")).not.toHaveTextContent(en.errorState.title);
  });

  it("offers to retry when it can, reached and activated by the keyboard, once for each press", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState error={error} onRetry={onRetry} />);
    await user.tab();
    const retry = screen.getByRole("button", { name: en.common.retry });
    expect(retry).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("has no button when there is nothing to retry", () => {
    render(<ErrorState error={error} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows that a retry is running and blocks a second one", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState error={error} onRetry={onRetry} isRetrying />);
    const retry = screen.getByRole("button", { name: en.common.retry });
    expect(retry).toHaveAttribute("aria-busy", "true");
    await user.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("has no accessibility violation, with and without the retry action", async () => {
    const { container } = render(
      <>
        <ErrorState error={error} />
        <ErrorState error={error} onRetry={() => undefined} />
      </>,
    );
    await expectAccessible(container);
  });
});
