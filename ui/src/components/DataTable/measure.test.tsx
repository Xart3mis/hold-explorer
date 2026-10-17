import { act, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAND_IN_CHAR_WIDTHS, useCharWidths, useTableMetrics } from "./measure";

const root = document.documentElement;

function Widths() {
  const widths = useCharWidths();
  return <output>{`${String(widths.text)} ${String(widths.mono)}`}</output>;
}

function Metrics({ density }: { density?: "comfortable" | "compact" }) {
  const metrics = useTableMetrics(density);
  return (
    <output>{`${String(metrics.rowHeight)} ${String(metrics.headerHeight)} ${String(metrics.paddingX)}`}</output>
  );
}

/** Lays the measured text out as a browser would: each face with its own width for a zero. */
function layOut(text: number, mono: number) {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const face = this.getAttribute("data-face");
    const zero = face === "text" ? text : face === "mono" ? mono : 0;
    return new DOMRect(0, 0, zero * (this.textContent.length || 0), 16);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  root.removeAttribute("data-density");
  Reflect.deleteProperty(document, "fonts");
});

describe("useCharWidths", () => {
  it("answers the stand-in widths where nothing is laid out", () => {
    render(<Widths />);
    expect(screen.getByRole("status")).toHaveTextContent(
      `${String(STAND_IN_CHAR_WIDTHS.text)} ${String(STAND_IN_CHAR_WIDTHS.mono)}`,
    );
  });

  it("measures the width of a zero in the table face and in the monospace face", () => {
    layOut(7.25, 7.8);
    render(<Widths />);
    expect(screen.getByRole("status")).toHaveTextContent("7.25 7.8");
  });

  it("measures again when the fonts have loaded", () => {
    const fonts = Object.assign(new EventTarget(), { ready: Promise.resolve() });
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    const laidOut = layOut(6.5, 8);
    render(<Widths />);
    expect(screen.getByRole("status")).toHaveTextContent("6.5 8");

    laidOut.mockRestore();
    layOut(7.25, 7.8);
    act(() => {
      fonts.dispatchEvent(new Event("loadingdone"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("7.25 7.8");
  });

  it("has measured before anything is painted: by the time the layout effects have run", () => {
    layOut(7.25, 7.8);
    const seen: (string | null)[] = [];
    function Page() {
      // A layout effect of the parent runs after those of its children, and before the paint.
      useLayoutEffect(() => {
        seen.push(document.querySelector("[data-part='char-probe']") === null ? null : "measured");
      }, []);
      return <Widths />;
    }
    render(<Page />);
    expect(seen).toEqual(["measured"]);
    expect(screen.getByRole("status")).toHaveTextContent("7.25 7.8");
  });

  it("keeps what it measured when the fonts are ready only after the last table went", async () => {
    let ready: () => void = () => undefined;
    const fonts = Object.assign(new EventTarget(), {
      ready: new Promise<void>((resolve) => {
        ready = resolve;
      }),
    });
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    layOut(7.25, 7.8);
    const { unmount } = render(<Widths />);
    expect(screen.getByRole("status")).toHaveTextContent("7.25 7.8");
    unmount();

    await act(async () => {
      ready();
      await fonts.ready;
    });
    // The next table starts with what was measured, not with the stand-ins.
    const first: string[] = [];
    function Next() {
      const widths = useCharWidths();
      first.push(`${String(widths.text)} ${String(widths.mono)}`);
      return null;
    }
    render(<Next />);
    expect(first[0]).toBe("7.25 7.8");
  });

  it("keeps one measurement for every table, and leaves nothing behind when the last one goes", () => {
    const { unmount } = render(
      <>
        <Widths />
        <Widths />
      </>,
    );
    expect(document.querySelectorAll("[data-part='char-probe']")).toHaveLength(1);
    unmount();
    expect(document.querySelectorAll("[data-part='char-probe']")).toHaveLength(0);
  });
});

describe("useTableMetrics", () => {
  it("reads the heights and the padding of the density of the app", () => {
    render(<Metrics />);
    expect(screen.getByRole("status")).toHaveTextContent("36 36 12");
  });

  it("follows the density of the app when it changes", async () => {
    render(<Metrics />);
    act(() => {
      root.setAttribute("data-density", "compact");
    });
    expect(await screen.findByText("28 28 8")).toBeInTheDocument();
  });

  it("takes the density of the table before the density of the app", () => {
    root.setAttribute("data-density", "compact");
    render(<Metrics density="comfortable" />);
    expect(screen.getByRole("status")).toHaveTextContent("36 36 12");
  });
});
