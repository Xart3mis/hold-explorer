// Helpers of the tests of the Export menu and its panel: the app with the export commands
// recorded, the menu, and the rows of a table.
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";
import type { ArgsOf } from "../api/commands";
import en from "../locales/en.json";
import { must, renderApp } from "./app";
import { openStart } from "./fixtures";
import type { Handlers } from "./ipc";
import { windowApi } from "./window";

type SaveArgs = ArgsOf<"export_save">;
type CopyArgs = ArgsOf<"export_copy">;

/** The app at `path`, with the export commands answered at once and recorded. */
export function renderAt(path: string, handlers: Handlers = {}) {
  const saves: SaveArgs[] = [];
  const copies: CopyArgs[] = [];
  windowApi.chooseSavePath.mockImplementation((_, extension) =>
    Promise.resolve(`/home/ada/exports/out.${extension}`),
  );
  const app = renderApp({
    start: openStart(),
    path,
    handlers: {
      export_save: (args) => {
        saves.push(args);
        return { path: args.path, rows: 3 };
      },
      export_copy: (args) => {
        copies.push(args);
        return null;
      },
      ...handlers,
    },
  });
  return { ...app, saves, copies };
}

/** The Export button, once the screen has something to export. */
export async function exportButton(): Promise<HTMLElement> {
  const button = await screen.findByRole("button", { name: en.export.menu.label });
  await waitFor(() => {
    expect(button).not.toHaveAttribute("aria-busy");
  });
  return button;
}

/** Opens the Export menu by the pointer, and returns it. */
export async function openMenu(user: UserEvent): Promise<HTMLElement> {
  await user.click(await exportButton());
  return screen.findByRole("menu", { name: en.export.menu.name });
}

/** The names of the items of a menu, in order: their labels, without a detail. */
export function itemNames(open: HTMLElement): string[] {
  return within(open)
    .getAllByRole("menuitem")
    .map((item) => item.querySelector('[slot="label"]')?.textContent ?? "");
}

/** Clicks each of `rows` with Ctrl held, which selects them beside the others. */
export async function ctrlClick(user: UserEvent, ...rows: HTMLElement[]): Promise<void> {
  await user.keyboard("{Control>}");
  for (const row of rows) await user.click(row);
  await user.keyboard("{/Control}");
}

/** The row of a table whose row header is `name`. */
export async function rowOf(name: string): Promise<HTMLElement> {
  return must(
    (await screen.findByRole("rowheader", { name })).closest<HTMLElement>("[role='row']"),
    `the row of ${name}`,
  );
}
