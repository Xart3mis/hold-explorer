import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { SectionTitle } from "./SectionTitle";

describe("SectionTitle", () => {
  it("is a heading of the level it is given, named by its text", () => {
    render(
      <>
        <SectionTitle level={2}>Snapshot date</SectionTitle>
        <SectionTitle level={3}>Open holds</SectionTitle>
      </>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Snapshot date" })).toHaveAttribute(
      "data-level",
      "2",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Open holds" })).toHaveAttribute(
      "data-level",
      "3",
    );
  });

  it("carries an id, so a section can be named by its title", () => {
    render(
      <section aria-labelledby="date-title">
        <SectionTitle level={2} id="date-title">
          Snapshot date
        </SectionTitle>
      </section>,
    );
    expect(screen.getByRole("region", { name: "Snapshot date" })).toBeInTheDocument();
  });

  it("is not a control and takes no focus", async () => {
    const user = userEvent.setup();
    render(<SectionTitle level={2}>Workspace</SectionTitle>);
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it("has no accessibility violation", async () => {
    const { container } = render(
      <>
        <h1>Review import</h1>
        <SectionTitle level={2}>Snapshot date</SectionTitle>
        <SectionTitle level={3}>Open holds</SectionTitle>
      </>,
    );
    await expectNoAxeViolations(container);
  });
});
