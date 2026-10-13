import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { Destination } from "../app/destinations";
import { AppProviders } from "../app/providers";
import { queryClient } from "../app/query";
import { appRoutes, type DestinationPages } from "../app/router";
import type { AppStart } from "../bindings/AppStart";
import { filterOptions } from "./filters";
import { startState } from "./fixtures";
import { mockCommands, type Handlers } from "./ipc";
import { overviewOf } from "./overview";

export interface RenderAppOptions {
  /** What `app_start` returns. Nothing open and an empty folder otherwise. */
  start?: AppStart;
  /** Handlers for the other commands the test expects, or its own `app_start`. */
  handlers?: Handlers;
  /** Where the app is when it renders: an address, or an address with what was passed to it. */
  path?: string | { pathname: string; search?: string; state?: unknown };
  /** A copy of the destination list, for a test that changes what is available. */
  destinations?: readonly Destination[];
  /** The pages of the available destinations, with the same purpose. */
  pages?: DestinationPages;
}

/**
 * Renders the whole app, with its providers, on a router that keeps its history in memory. The
 * commands answer from `start` and `handlers`; `workspace_list` answers with the list of `start`,
 * `overview` with the overview of the snapshot `start` has selected, and `filter_options` with
 * the options of the default filter, unless the test gives its own.
 */
export function renderApp(options: RenderAppOptions = {}) {
  const start = options.start ?? startState();
  // A fresh app has loaded nothing yet, also when a test renders the app a second time.
  queryClient.clear();
  mockCommands({
    app_start: () => start,
    workspace_list: () => start.list,
    overview: () => overviewOf(start.open),
    filter_options: () => filterOptions(),
    ...options.handlers,
  });
  const router = createMemoryRouter(appRoutes(options.destinations, options.pages), {
    initialEntries: [options.path ?? "/"],
  });
  const user = userEvent.setup();
  const view = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, user, start };
}

/** A value a test knows to be there. It fails with what was expected when the value is absent. */
export function must<T>(value: T | null | undefined, what = "the value"): T {
  if (value === null || value === undefined) throw new Error(`The test expected ${what}.`);
  return value;
}

/**
 * The top bar. The header of a page is a `header` element as well, and the test tools take any
 * such element for a banner, so the top bar is the first of them. Ask once the app has loaded:
 * the top bar of the first load is another element.
 */
export function topBar(): HTMLElement {
  const [bar] = document.querySelectorAll<HTMLElement>("header");
  if (!bar) throw new Error("The app has no top bar yet.");
  return bar;
}
