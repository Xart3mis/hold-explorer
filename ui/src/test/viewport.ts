import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

/**
 * A size for the table's scroller, for the tests of what a virtualised table leaves out.
 *
 * jsdom lays nothing out, so no element has a size. The component library knows that: in a test
 * it renders every row of a virtualised table, which is what the test of a screen wants, since
 * it looks for a row by its text and not for where it is. That is how every test runs that does
 * not ask for this.
 *
 * A test of the windowing itself needs a viewport. `tableViewport` gives one, for the tests of
 * the `describe` it is called in: every element answers `clientWidth` and `clientHeight` with the
 * size given, which the library takes for the size of the scroller. From then on only the rows
 * near the visible part are rendered, a scroll moves that part, and Page Up and Page Down move by
 * its height. The size is taken away again after each test, so no other test sees it.
 *
 * Call it at the top of a `describe`, not inside a test.
 */
export function tableViewport(size: { width: number; height: number }): void {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => size.width,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => size.height,
    });
  });
  afterEach(() => {
    // The property of `Element` is underneath, and answers zero as before.
    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  });
}

/** Scrolls a table to an offset from its top, as a wheel or a scrollbar would. */
export function scrollTable(grid: HTMLElement, top: number): void {
  fireEvent.scroll(grid, { target: { scrollTop: top } });
}
