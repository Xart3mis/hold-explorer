import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Settings } from "../../bindings/Settings";
import type { UpdateNotice } from "../../bindings/UpdateNotice";
import en from "../../locales/en.json";
import { expectNoAxeViolations } from "../../test/axe";
import { renderApp } from "../../test/app";
import { openStart } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";

const words = en.shell;
const available = (version: string) => words.updateAvailable.replace("{{version}}", version);

/** The notice that a newer version is available, once it shows. */
async function notice(version = "0.2.0") {
  const text = await screen.findByText(available(version));
  const found = text.closest<HTMLElement>("[role=status]");
  if (found === null) throw new Error("The update notice is not a status.");
  return found;
}

describe("the update notice", () => {
  it("asks once after the start and shows nothing when there is no newer version", async () => {
    const check = vi.fn((): UpdateNotice | null => null);
    const { user } = renderApp({ start: openStart(), handlers: { update_check: check } });
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
    await waitFor(() => {
      expect(check).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/is available/)).not.toBeInTheDocument();
    // Another page asks nothing more.
    await user.click(screen.getByRole("link", { name: en.destinations.name.lines }));
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.lines });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when the check failed", async () => {
    renderApp({
      start: openStart(),
      handlers: {
        update_check: () => {
          throw commandFailure("Internal", "The check failed.");
        },
      },
    });
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
    expect(screen.queryByText(/is available/)).not.toBeInTheDocument();
    expect(screen.queryByText("The check failed.")).not.toBeInTheDocument();
  });

  it("names a newer version with its two actions, on every page", async () => {
    const { user } = renderApp({
      start: openStart(),
      handlers: { update_check: () => ({ version: "0.2.0" }) },
    });
    const shown = await notice();
    expect(within(shown).getByRole("button", { name: words.updateReleasePage })).toBeVisible();
    expect(within(shown).getByRole("button", { name: words.updateSkip })).toBeVisible();
    await user.click(screen.getByRole("link", { name: en.destinations.name.settings }));
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.settings });
    expect(screen.getByText(available("0.2.0"))).toBeInTheDocument();
  });

  it("opens the release page of the version it names", async () => {
    const open = vi.fn<(args: { version: string }) => null>(() => null);
    const { user } = renderApp({
      start: openStart(),
      handlers: { update_check: () => ({ version: "0.2.0" }), open_release_page: open },
    });
    await user.click(within(await notice()).getByRole("button", { name: words.updateReleasePage }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({ version: "0.2.0" });
    });
    expect(open).toHaveBeenCalledTimes(1);
    // The notice stays: the user may come back to it.
    expect(screen.getByText(available("0.2.0"))).toBeInTheDocument();
  });

  it("keeps Skip this version inert while the release page is being opened", async () => {
    let finish = (): void => undefined;
    const skip = vi.fn((): Settings => openStart().settings);
    const { user } = renderApp({
      start: openStart(),
      handlers: {
        update_check: () => ({ version: "0.2.0" }),
        open_release_page: () =>
          new Promise<null>((resolve) => {
            finish = () => {
              resolve(null);
            };
          }),
        update_skip: skip,
      },
    });
    const shown = await notice();
    await user.click(within(shown).getByRole("button", { name: words.updateReleasePage }));
    const skipButton = within(shown).getByRole("button", { name: words.updateSkip });
    await waitFor(() => {
      expect(skipButton).toHaveAttribute("data-inert");
    });
    await user.click(skipButton);
    expect(skip).not.toHaveBeenCalled();
    finish();
    await waitFor(() => {
      expect(skipButton).not.toHaveAttribute("data-inert");
    });
  });

  it("says why the release page could not be opened", async () => {
    const message = "Hold Explorer could not open the release page: no browser.";
    const { user } = renderApp({
      start: openStart(),
      handlers: {
        update_check: () => ({ version: "0.2.0" }),
        open_release_page: () => {
          throw commandFailure("Open", message);
        },
      },
    });
    await user.click(within(await notice()).getByRole("button", { name: words.updateReleasePage }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(words.updateReleasePageError);
    expect(alert).toHaveTextContent(message);
  });

  it("is hidden and saved by Skip this version", async () => {
    const skip = vi.fn(({ version }: { version: string }): Settings => ({
      ...openStart().settings,
      skipped_version: version,
    }));
    const open = vi.fn(() => null);
    const { user } = renderApp({
      start: openStart(),
      handlers: {
        update_check: () => ({ version: "0.2.0" }),
        update_skip: skip,
        open_release_page: open,
      },
    });
    await user.click(within(await notice()).getByRole("button", { name: words.updateSkip }));
    await waitFor(() => {
      expect(screen.queryByText(available("0.2.0"))).not.toBeInTheDocument();
    });
    expect(skip).toHaveBeenCalledTimes(1);
    expect(skip).toHaveBeenCalledWith({ version: "0.2.0" });
    expect(open).not.toHaveBeenCalled();
  });

  it("is hidden by its close button without skipping the version", async () => {
    const skip = vi.fn((): Settings => openStart().settings);
    const { user } = renderApp({
      start: openStart(),
      handlers: { update_check: () => ({ version: "0.2.0" }), update_skip: skip },
    });
    await user.click(within(await notice()).getByRole("button", { name: en.common.dismiss }));
    expect(screen.queryByText(available("0.2.0"))).not.toBeInTheDocument();
    expect(skip).not.toHaveBeenCalled();
  });

  it("has no accessibility violation", SLOW, async () => {
    renderApp({ start: openStart(), handlers: { update_check: () => ({ version: "0.2.0" }) } });
    await notice();
    await expectNoAxeViolations(document.body, { page: true });
  });
});
