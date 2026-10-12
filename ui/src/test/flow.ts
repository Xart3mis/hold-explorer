import { screen, within } from "@testing-library/react";
import { keys } from "../api/keys";
import { queryClient } from "../app/query";
import type { AppStart } from "../bindings/AppStart";
import type { ImportDraft } from "../bindings/ImportDraft";
import { renderApp } from "./app";
import { openStart } from "./fixtures";
import type { Handlers } from "./ipc";

export interface OpenFlowOptions {
  /** The file that is open for import, as the import page left it in the cache. */
  draft: ImportDraft;
  /** Where the import was started. Lines otherwise. */
  from?: string;
  start?: AppStart;
  handlers?: Handlers;
}

/**
 * Renders the app on a page of the import flow with a file already open, as the import page
 * leaves it: the draft in the cache and the address the import was started from in the state of
 * the navigation. The draft is put in place before the application start answers, so the page
 * finds it when it first renders.
 */
export function openFlow(pathname: string, options: OpenFlowOptions) {
  const app = renderApp({
    start: options.start ?? openStart(),
    path: { pathname, state: { from: options.from ?? "/lines" } },
    ...(options.handlers === undefined ? {} : { handlers: options.handlers }),
  });
  queryClient.setQueryData(keys.importDraft, options.draft);
  return app;
}

/** The content area once the page with this title shows. */
export async function pageTitled(title: string): Promise<HTMLElement> {
  await screen.findByRole("heading", { level: 1, name: title });
  return screen.getByRole("main");
}

/** Opens the select with this label and chooses the option whose name matches. */
export async function choose(
  user: ReturnType<typeof renderApp>["user"],
  label: RegExp | string,
  option: RegExp | string,
): Promise<void> {
  await user.click(screen.getByRole("button", { name: label }));
  const list = await screen.findByRole("listbox");
  await user.click(within(list).getByRole("option", { name: option }));
}
