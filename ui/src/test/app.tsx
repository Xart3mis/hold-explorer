import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { Destination } from "../app/destinations";
import { AppProviders } from "../app/providers";
import { queryClient } from "../app/query";
import { appRoutes, type DestinationPages } from "../app/router";
import type { AppStart } from "../bindings/AppStart";
import type { ViewRef } from "../bindings/ViewRef";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import { breakdownGroups, foldedMatrix, groupDetail } from "./breakdown";
import { filterOptions, valuePage } from "./filters";
import { startState } from "./fixtures";
import { commandFailure, mockCommands, type Handlers } from "./ipc";
import { holdRef, holdsView, lineDetail, linePage } from "./lines";
import { overviewOf } from "./overview";

/** The view a workspace that is open shows: the one a data command must be sent. */
function viewOf(open: WorkspaceOpen | null): ViewRef | null {
  return open === null ? null : { workspace_id: open.workspace.id, snapshot_id: open.selected };
}

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
 * `overview` with the overview of the snapshot the mock holds, `filter_options` with the
 * options of the default filter, `filter_values` with three values whatever the dimension, and
 * `lines` and `holds` with the three lines and the three holds of a small snapshot, and
 * `line_detail` and `hold_detail` with the detail of the line or the hold asked for, `breakdown`
 * with three groups whatever the dimension, `group_detail` with three lines of the group asked
 * for, and `matrix` with three rows and two columns and Other on both sides whatever the
 * dimensions, unless the test gives its own. Those answers are for the view the mocked Rust side holds, which is the one
 * `start` opens and then the one the test's own `workspace_open`, `workspace_create`,
 * `workspace_current`, `snapshot_select`, `demo_create`, or `import_commit` answered with: for
 * any other view they fail with the kind `ViewChanged`, as the Rust side does.
 */
export function renderApp(options: RenderAppOptions = {}) {
  const start = options.start ?? startState();
  // A fresh app has loaded nothing yet, also when a test renders the app a second time.
  queryClient.clear();
  // The view the mocked Rust side holds: the start's, then the one each command that opens a
  // workspace or selects a snapshot answered with. The data commands answered here refuse any
  // other, with the kind `ViewChanged`, as the Rust side does.
  let heldOpen = start.open;
  let held = viewOf(heldOpen);
  const given = options.handlers ?? {};
  /** A handler of the test that changes the view, made to move the view the mock holds. */
  function follow<Args, Result>(
    handler: (args: Args) => Result | Promise<Result>,
    openOf: (result: Result) => WorkspaceOpen | null,
  ) {
    return async (args: Args) => {
      const result = await handler(args);
      heldOpen = openOf(result);
      held = viewOf(heldOpen);
      return result;
    };
  }
  /** An answer of this helper, for the view the mock holds only. */
  function inView<Args extends { view: ViewRef }, Result>(answer: (args: Args) => Result) {
    return (args: Args): Result => {
      const { workspace_id, snapshot_id } = args.view;
      if (workspace_id !== held?.workspace_id || snapshot_id !== held.snapshot_id) {
        throw commandFailure("ViewChanged", "The mocked Rust side holds another view.");
      }
      return answer(args);
    };
  }
  const opens = (open: WorkspaceOpen | null) => open;
  const {
    workspace_open: open,
    workspace_create: create,
    workspace_current: current,
    snapshot_select: select,
    demo_create: demo,
    import_commit: commit,
  } = given;
  const tracked: Handlers = {
    ...(open && { workspace_open: follow(open, opens) }),
    ...(create && { workspace_create: follow(create, opens) }),
    ...(current && { workspace_current: follow(current, opens) }),
    ...(select && { snapshot_select: follow(select, opens) }),
    ...(demo && { demo_create: follow(demo, opens) }),
    ...(commit && { import_commit: follow(commit, (done) => done.open) }),
  };
  mockCommands({
    app_start: () => start,
    workspace_list: () => start.list,
    overview: inView(() => overviewOf(heldOpen)),
    filter_options: inView(() => filterOptions()),
    filter_values: inView(() => valuePage()),
    lines: inView(() => linePage()),
    holds: inView(() => holdsView()),
    line_detail: inView(({ lineId }) => lineDetail(lineId)),
    hold_detail: inView(({ position }) => holdRef(position)),
    breakdown: inView(() => breakdownGroups()),
    group_detail: inView(({ key }) => groupDetail(key)),
    matrix: inView(() => foldedMatrix()),
    ...given,
    ...tracked,
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
