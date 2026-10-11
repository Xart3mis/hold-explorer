import { expect } from "vitest";
import { axe } from "vitest-axe";

export interface AccessibleOptions {
  /**
   * The container is a whole page, so everything in it must sit inside a landmark. A component
   * rendered on its own has no landmark around it, and the rule is left out for it.
   */
  page?: boolean;
}

/**
 * Runs the accessibility checker on what was rendered and fails on any violation. Without a
 * container it checks the whole document, which includes what a component renders outside its
 * own element: a list that is open, a tooltip.
 *
 * The checker cannot measure color contrast under jsdom. Contrast is checked from the tables of
 * DESIGN.md by `node tools/design/check-tokens.mjs`, as long as a component only combines the
 * pairs listed there.
 */
export async function expectAccessible(
  container: Element = document.body,
  options: AccessibleOptions = {},
): Promise<void> {
  const results = await axe(container, {
    rules: {
      region: { enabled: options.page === true },
      // jsdom draws nothing, so contrast cannot be measured here; see above for where it is checked.
      "color-contrast": { enabled: false },
    },
  });
  const found = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.html).join(" | ")})`,
  );
  expect(found).toEqual([]);
}
