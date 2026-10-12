import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
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

  it("has no breadcrumb when it is the page of a destination", () => {
    const { rerender } = render(<PageHeader title="Lines" />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

    rerender(<PageHeader title="Lines" breadcrumb={{ ancestors: [] }} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows the breadcrumb above the title, ending with the title as the current page", async () => {
    const toImport = vi.fn();
    const user = userEvent.setup();
    render(
      <PageHeader
        title="Map columns"
        breadcrumb={{ ancestors: [{ label: "Import", onPress: toImport }] }}
      />,
    );
    const trail = screen.getByRole("navigation", { name: en.breadcrumb.label });
    expect(
      within(trail)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Import", "Map columns"]);
    expect(within(trail).getByText("Map columns")).toHaveAttribute("aria-current", "page");
    const heading = screen.getByRole("heading", { level: 1, name: "Map columns" });
    expect(trail.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.tab();
    expect(screen.getByRole("link", { name: "Import" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(toImport).toHaveBeenCalledTimes(1);
  });

  it("takes another label for the current page than the title", () => {
    render(
      <PageHeader
        title="Review import"
        breadcrumb={{ ancestors: [{ label: "Import", href: "/import" }], current: "Review" }}
      />,
    );
    const items = within(screen.getByRole("navigation")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Import", "Review"]);
    expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute("href", "/import");
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
        breadcrumb={{ ancestors: [{ label: "Import", onPress: () => undefined }] }}
        actions={<Button variant="primary">Continue</Button>}
      />,
    );
    await expectAccessible(container);
  });
});
