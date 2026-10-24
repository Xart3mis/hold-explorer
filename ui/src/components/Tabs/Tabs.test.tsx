import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Tab, TabList, TabPanel, Tabs, type TabsProps } from "./Tabs";

function tabs(props: Omit<TabsProps, "children"> = {}) {
  return (
    <Tabs {...props}>
      <TabList aria-label="Breakdown">
        <Tab id="discipline">Discipline</Tab>
        <Tab id="type">Hold type</Tab>
        <Tab id="role" isDisabled>
          Role
        </Tab>
        <Tab id="blocker">Blocker type</Tab>
      </TabList>
      <TabPanel id="discipline">Holds by discipline</TabPanel>
      <TabPanel id="type">Holds by hold type</TabPanel>
      <TabPanel id="role">Holds by role</TabPanel>
      <TabPanel id="blocker">Holds by blocker type</TabPanel>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders a named tab list, its tabs, and the panel of the selected tab", () => {
    render(tabs());
    expect(screen.getByRole("tablist", { name: "Breakdown" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tab", { name: "Discipline" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: "Discipline" })).toHaveTextContent(
      "Holds by discipline",
    );
  });

  it("is reached by Tab, and the arrow keys, Home, and End move between tabs", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(tabs({ onSelectionChange }));

    await user.tab();
    expect(screen.getByRole("tab", { name: "Discipline" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Hold type" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Hold type" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Holds by hold type");
    expect(onSelectionChange).toHaveBeenLastCalledWith("type");

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Blocker type" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Discipline" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Blocker type" })).toHaveFocus();
  });

  it("selects a tab on a click", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(tabs({ onSelectionChange }));
    await user.click(screen.getByRole("tab", { name: "Blocker type" }));
    expect(onSelectionChange).toHaveBeenCalledWith("blocker");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Holds by blocker type");
  });

  it("skips a disabled tab and does not select it", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(tabs({ defaultSelectedKey: "type", onSelectionChange }));
    const role = screen.getByRole("tab", { name: "Role" });
    expect(role).toHaveAttribute("aria-disabled", "true");

    await user.click(role);
    expect(onSelectionChange).not.toHaveBeenCalled();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Blocker type" })).toHaveFocus();
  });

  it("follows the selected key it is given", () => {
    const { rerender } = render(tabs({ selectedKey: "type" }));
    expect(screen.getByRole("tab", { name: "Hold type" })).toHaveAttribute("aria-selected", "true");
    rerender(tabs({ selectedKey: "blocker" }));
    expect(screen.getByRole("tab", { name: "Blocker type" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("has no accessibility violation", async () => {
    const { container } = render(tabs());
    await expectNoAxeViolations(container);
  });
});
