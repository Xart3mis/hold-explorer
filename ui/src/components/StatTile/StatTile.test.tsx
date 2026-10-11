import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { StatTile, StatTileGroup } from "./StatTile";

describe("StatTile", () => {
  it("is a named group of figures, each with its label and value", () => {
    render(
      <StatTileGroup aria-label="Open holds in this snapshot">
        <StatTile label="Open holds" value="5,042" />
        <StatTile label="Lines on hold" value="3,611" />
      </StatTileGroup>,
    );
    const group = screen.getByRole("group", { name: "Open holds in this snapshot" });
    expect(within(group).getByText("Open holds")).toBeInTheDocument();
    expect(within(group).getByText("5,042")).toBeInTheDocument();
    expect(within(group).queryByRole("button")).not.toBeInTheDocument();
  });

  it("is a button when it opens something, reached by Tab and activated by Enter and Space", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <StatTileGroup aria-label="Open holds in this snapshot">
        <StatTile label="Open holds" value="5,042" onPress={onPress} />
      </StatTileGroup>,
    );
    const tile = screen.getByRole("button", { name: "Open holds 5,042" });
    await user.tab();
    expect(tile).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(tile);
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it("shows the change since the previous snapshot by an arrow and a sign, not by a color", () => {
    render(
      <StatTileGroup aria-label="Open holds in this snapshot">
        <StatTile
          label="Open holds"
          value="5,042"
          delta={{ direction: "down", change: "-118", caption: "since previous snapshot" }}
        />
      </StatTileGroup>,
    );
    const delta = screen.getByText("-118").closest('[data-part="delta"]');
    expect(delta).toHaveAttribute("data-direction", "down");
    expect(delta).toHaveTextContent("since previous snapshot");
    expect(delta?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("while loading keeps its label, shows a skeleton for the value, and cannot be pressed", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <StatTileGroup aria-label="Open holds in this snapshot">
        <StatTile label="Median age" isLoading onPress={onPress} />
      </StatTileGroup>,
    );
    const group = screen.getByRole("group");
    expect(within(group).getByText("Median age")).toBeInTheDocument();
    expect(group.querySelector('[data-part="skeleton"]')).not.toBeNull();
    expect(within(group).getByText(en.common.loading)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await user.click(within(group).getByText("Median age"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows a dash and the reason when the snapshot cannot give the figure", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <StatTileGroup aria-label="Open holds in this snapshot">
        <StatTile
          label="Median age"
          unavailable="The export has no created date column."
          onPress={onPress}
        />
      </StatTileGroup>,
    );
    expect(screen.getByText(en.common.noValue)).toBeInTheDocument();
    expect(screen.getByText("The export has no created date column.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await user.click(screen.getByText("Median age"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("has no accessibility violation in any state", async () => {
    const { container } = render(
      <StatTileGroup aria-label="Open holds in this snapshot">
        <StatTile label="Open holds" value="5,042" onPress={() => undefined} />
        <StatTile
          label="Lines on hold"
          value="3,611"
          delta={{ direction: "up", change: "+24", caption: "since previous snapshot" }}
        />
        <StatTile label="Single-hold lines" isLoading />
        <StatTile label="Median age" unavailable="The export has no created date column." />
      </StatTileGroup>,
    );
    await expectAccessible(container);
  });
});
