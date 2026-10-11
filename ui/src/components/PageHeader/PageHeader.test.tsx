import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectAccessible } from "../../test/axe";
import { Button } from "../Button/Button";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("shows the page title as the one first-level heading", () => {
    render(<PageHeader title="Lines" />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Lines" })).toBeInTheDocument();
  });

  it("shows a description under the title", () => {
    render(<PageHeader title="Review import" description="Holds_2026-10-07.xlsx" />);
    expect(screen.getByText("Holds_2026-10-07.xlsx")).toBeInTheDocument();
  });

  it("holds page actions, reached and activated by the keyboard", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <PageHeader
        title="Review import"
        actions={
          <Button variant="primary" onPress={onPress}>
            Import
          </Button>
        }
      />,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Import" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("offers a back link before the title, activated by the keyboard", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(<PageHeader title="Map columns" back={{ label: "Back to review", onPress }} />);
    const link = screen.getByRole("link", { name: "Back to review" });
    await user.tab();
    expect(link).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(
      link.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders a back link with an address as a real link", () => {
    render(
      <PageHeader title="Map columns" back={{ label: "Back to review", href: "/import/review" }} />,
    );
    expect(screen.getByRole("link", { name: "Back to review" })).toHaveAttribute(
      "href",
      "/import/review",
    );
  });

  it("lets the page move focus to its title after navigation", () => {
    const titleRef = createRef<HTMLHeadingElement>();
    render(<PageHeader title="Lines" titleRef={titleRef} />);
    titleRef.current?.focus();
    expect(screen.getByRole("heading", { level: 1, name: "Lines" })).toHaveFocus();
  });

  it("has no accessibility violation", async () => {
    const { container } = render(
      <PageHeader
        title="Map columns"
        description="Choose the column of the file that holds each field."
        back={{ label: "Back to review", onPress: () => undefined }}
        actions={<Button variant="primary">Continue</Button>}
      />,
    );
    await expectAccessible(container);
  });
});
