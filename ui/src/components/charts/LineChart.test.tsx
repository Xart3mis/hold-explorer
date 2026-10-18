import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCount } from "../../text/format";
import { expectAccessible } from "../../test/axe";
import { LineChart, type LineChartProps, type LinePoint } from "./LineChart";

// The chart sizes itself to its container, which jsdom never lays out. A container of 600 pixels
// is reported to it, as a window would.
const WIDTH = 600;
const HEIGHT = 220;
class SizedObserver implements ResizeObserver {
  constructor(private readonly report: ResizeObserverCallback) {}
  observe(target: Element) {
    const entry = { target, contentRect: new DOMRect(0, 0, WIDTH, HEIGHT) };
    this.report([entry as ResizeObserverEntry], this);
  }
  readonly unobserve = (): void => undefined;
  readonly disconnect = (): void => undefined;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", SizedObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A solve order of 40 steps: each step frees a few more lines. */
const points: LinePoint[] = Array.from({ length: 40 }, (_, index) => ({
  x: index + 1,
  y: (index + 1) * 3,
  label: `Blocker ${String(index + 1)}`,
}));

function chart(props: Partial<LineChartProps> = {}) {
  return (
    <LineChart
      aria-label="Lines freed by the solve order"
      points={points}
      yMax={150}
      xLabel="Step"
      yLabel="Lines freed"
      labelName="Blocker"
      formatY={formatCount}
      {...props}
    />
  );
}

function option(): HTMLElement {
  return within(screen.getByRole("listbox")).getByRole("option");
}

describe("LineChart", () => {
  it("draws the whole series as one line, with no marker at rest", () => {
    const { container } = render(chart());
    expect(container.querySelectorAll("path[data-part=line]")).toHaveLength(1);
    expect(container.querySelector("[data-part=marker]")).toBeNull();
  });

  it("is one stop in the Tab order and starts on the first point", async () => {
    const user = userEvent.setup();
    render(chart());
    await user.tab();
    const box = screen.getByRole("listbox", { name: "Lines freed by the solve order" });
    expect(box).toHaveFocus();
    expect(option()).toHaveAttribute("aria-posinset", "1");
    expect(option()).toHaveAttribute("aria-setsize", "40");
    expect(option()).toHaveTextContent("Blocker 1. Step 1, Lines freed 3.");
  });

  it("moves point by point, by a tenth with Page Up and Page Down, and to the ends", async () => {
    const user = userEvent.setup();
    render(chart());
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(option()).toHaveAttribute("aria-posinset", "3");
    await user.keyboard("{ArrowLeft}");
    expect(option()).toHaveAttribute("aria-posinset", "2");
    await user.keyboard("{PageDown}");
    expect(option()).toHaveAttribute("aria-posinset", "6");
    await user.keyboard("{PageUp}{PageUp}");
    expect(option()).toHaveAttribute("aria-posinset", "1");
    await user.keyboard("{End}");
    expect(option()).toHaveAttribute("aria-posinset", "40");
    await user.keyboard("{ArrowRight}");
    expect(option()).toHaveAttribute("aria-posinset", "40");
    await user.keyboard("{Home}");
    expect(option()).toHaveAttribute("aria-posinset", "1");
  });

  it("shows a marker and the tooltip of the point at once on focus", async () => {
    const user = userEvent.setup();
    const { container } = render(chart());
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(container.querySelectorAll("[data-part=marker]")).toHaveLength(1);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Blocker 2");
    expect(tooltip).toHaveTextContent("Step");
    expect(tooltip).toHaveTextContent("Lines freed");
    expect(tooltip).toHaveTextContent("6");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("listbox")).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("presses the point with Enter", async () => {
    const user = userEvent.setup();
    const onPointPress = vi.fn();
    render(chart({ onPointPress }));
    await user.tab();
    await user.keyboard("{End}{Enter}");
    expect(onPointPress).toHaveBeenCalledWith(points[39], 39);
  });

  it("starts on the point the screen has selected, and marks it at rest", async () => {
    const user = userEvent.setup();
    const { container } = render(chart({ selectedIndex: 9 }));
    expect(container.querySelector("[data-part=marker][data-selected]")).not.toBeNull();
    await user.tab();
    expect(option()).toHaveAttribute("aria-posinset", "10");
    expect(option()).toHaveAttribute("aria-selected", "true");
  });

  it("follows the pointer to the nearest point and shows its tooltip after the delay", () => {
    vi.useFakeTimers();
    const { container } = render(chart());
    const plot = container.querySelector("svg");
    if (!plot) throw new Error("The chart drew nothing");
    vi.spyOn(plot, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, WIDTH, HEIGHT));
    // Far right of the plot: the last point is the nearest.
    fireEvent.pointerMove(plot, { clientX: WIDTH - 1, clientY: 100, pointerType: "mouse" });
    expect(container.querySelectorAll("[data-part=marker]")).toHaveLength(1);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Blocker 40");
    fireEvent.pointerLeave(plot, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("lets the keyboard lead while the pointer rests on the plot, until the pointer moves", () => {
    vi.useFakeTimers();
    const { container } = render(chart());
    const plot = container.querySelector("svg");
    if (!plot) throw new Error("The chart drew nothing");
    vi.spyOn(plot, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, WIDTH, HEIGHT));
    const box = screen.getByRole("listbox");
    act(() => {
      box.focus();
    });
    // The pointer rests on point 31, and its tooltip shows.
    fireEvent.pointerMove(plot, { clientX: (30 / 39) * WIDTH, clientY: 100, pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Blocker 31");

    // A key moves the keyboard's point, and it is the one drawn and named.
    fireEvent.keyDown(box, { key: "ArrowRight" });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Blocker 2");
    expect(tooltip).not.toHaveTextContent("Blocker 31");
    const markers = container.querySelectorAll("[data-part=marker][data-active]");
    expect(markers).toHaveLength(1);
    expect(Number(markers[0]?.getAttribute("cx"))).toBeCloseTo((1 / 39) * WIDTH);

    // The pointer moves again: it leads again, without a new delay.
    fireEvent.pointerMove(plot, { clientX: WIDTH - 1, clientY: 100, pointerType: "mouse" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Blocker 40");
  });

  it("moves the keyboard to the point that was clicked", async () => {
    const user = userEvent.setup();
    const onPointPress = vi.fn();
    const { container } = render(chart({ onPointPress }));
    const plot = container.querySelector("svg");
    if (!plot) throw new Error("The chart drew nothing");
    vi.spyOn(plot, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, WIDTH, HEIGHT));
    await user.pointer({
      target: plot,
      coords: { clientX: WIDTH - 1, clientY: 100 },
      keys: "[MouseLeft]",
    });
    expect(onPointPress).toHaveBeenCalledWith(points[39], 39);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowLeft" });
    expect(option()).toHaveAttribute("aria-posinset", "39");
  });

  it("points to another option at every move, so the move is announced", async () => {
    const user = userEvent.setup();
    render(chart());
    await user.tab();
    const box = screen.getByRole("listbox");
    const first = box.getAttribute("aria-activedescendant");
    expect(first).toBe(option().id);
    await user.keyboard("{ArrowRight}");
    const second = box.getAttribute("aria-activedescendant");
    expect(second).not.toBe(first);
    expect(second).toBe(option().id);
    await user.keyboard("{ArrowLeft}");
    expect(box.getAttribute("aria-activedescendant")).toBe(first);
  });

  it("closes a tooltip the pointer opened on Escape, while the focus is elsewhere", () => {
    vi.useFakeTimers();
    const { container } = render(chart());
    const plot = container.querySelector("svg");
    if (!plot) throw new Error("The chart drew nothing");
    vi.spyOn(plot, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, WIDTH, HEIGHT));
    fireEvent.pointerMove(plot, { clientX: 10, clientY: 100, pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("tells the screen which point is shown only when it changes", async () => {
    const user = userEvent.setup();
    const seen: (number | null)[] = [];
    const { rerender } = render(
      chart({
        onActiveChange: (index) => {
          seen.push(index);
        },
      }),
    );
    // Nothing is shown at first, and that is not news.
    expect(seen).toEqual([]);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    // A new handler at a render of the screen does not repeat the last call.
    rerender(
      chart({
        onActiveChange: (index) => {
          seen.push(index);
        },
      }),
    );
    expect(seen).toEqual([0, 1]);
  });

  it("tells the screen its point again when its points change, and nothing once it goes", async () => {
    const user = userEvent.setup();
    const seen: (number | null)[] = [];
    const onActiveChange = (index: number | null) => {
      seen.push(index);
    };
    const { rerender, unmount } = render(chart({ onActiveChange }));
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(seen).toEqual([0, 1]);
    // Another result under the focus: the point it shows is told again, as it is now.
    rerender(chart({ onActiveChange, points: points.map((point) => ({ ...point })) }));
    expect(seen).toEqual([0, 1, 1]);
    // Fewer points than the one in focus: the last is shown, and told.
    rerender(chart({ onActiveChange, points: points.slice(0, 1) }));
    expect(seen.at(-1)).toBe(0);
    // The chart goes with a point shown: the screen hears that none is.
    unmount();
    expect(seen.at(-1)).toBeNull();
  });

  it("draws one point with its marker", () => {
    const { container } = render(chart({ points: [{ x: 1, y: 5, label: "Blocker 1" }] }));
    expect(container.querySelectorAll("[data-part=marker]")).toHaveLength(1);
  });

  it("shows the same points in its table view", () => {
    render(chart({ view: "table" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    const table = screen.getByRole("grid", { name: "Lines freed by the solve order, table" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Step", "Blocker", "Lines freed"]);
    const bodyRows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        [...within(row).getAllByRole("rowheader"), ...within(row).getAllByRole("gridcell")].map(
          (part) => part.textContent,
        ),
      );
    expect(bodyRows).toEqual(
      points.map((point) => [formatCount(point.x), point.label, formatCount(point.y)]),
    );
  });

  it("keeps its table view to twelve rows, or to the rows the screen gives", () => {
    const maxRows = () =>
      document
        .querySelector<HTMLElement>("[data-height='rows']")
        ?.style.getPropertyValue("--table-max-rows");
    const { rerender } = render(chart({ view: "table" }));
    expect(maxRows()).toBe("12");
    rerender(chart({ view: "table", tableRows: 6 }));
    expect(maxRows()).toBe("6");
  });

  it("shows a skeleton on a first load and the empty state of the screen without points", () => {
    const { rerender } = render(chart({ isLoading: true }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("Loading")).toBeInTheDocument();
    rerender(chart({ points: [], emptyState: <p>No blocker is in the solve order</p> }));
    expect(screen.getByText("No blocker is in the solve order")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("has no accessibility violation, as a chart with a tooltip and as a table", async () => {
    const user = userEvent.setup();
    const { rerender } = render(chart({ onPointPress: () => undefined }));
    await user.tab();
    await screen.findByRole("tooltip");
    await expectAccessible();
    rerender(chart({ view: "table" }));
    await expectAccessible();
  });
});
