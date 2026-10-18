import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { createDetailFocus, DetailFocusContext, useDetailFocus, useSelection } from "./selection";
import { useTableDetailFocus } from "./tableFocus";

const ROWS = ["a", "b", "c"];

/** Stands for the panel: a heading the focus can be asked to, while something is selected. */
function Heading() {
  const focus = useDetailFocus();
  const { selection } = useSelection();
  useEffect(() => {
    focus.setHeading(() => {
      document.getElementById("heading")?.focus();
    });
    return () => {
      focus.setHeading(null);
    };
  }, [focus]);
  useEffect(() => {
    if (selection !== null && focus.takeHeadingAsk()) document.getElementById("heading")?.focus();
  }, [focus, selection]);
  return selection === null ? null : (
    <h2 id="heading" tabIndex={-1}>
      Panel
    </h2>
  );
}

/**
 * A page with a table of rows that select a line on Enter or a press, as DataTable does, and a
 * control beside the table that selects one as well, as the curve of Blockers does.
 */
function Page({ rows }: { rows: readonly string[] }) {
  const { selection, select } = useSelection();
  const selectedKey = selection?.kind === "line" ? selection.lineId : null;
  const { listenTo, listenBeside, chosen } = useTableDetailFocus({ selectedKey });
  const choose = (key: string) => {
    chosen(key);
    select({ kind: "line", lineId: key });
  };
  return (
    <>
      <div ref={listenTo}>
        <div role="grid" aria-label="Rows" tabIndex={-1}>
          {rows.map((key) => (
            <div
              key={key}
              role="row"
              data-key={key}
              tabIndex={-1}
              aria-label={`Row ${key}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" && key !== selectedKey) choose(key);
              }}
              onClick={() => {
                choose(key);
              }}
            />
          ))}
        </div>
      </div>
      <div ref={listenBeside}>
        <button
          type="button"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              choose("c");
            }
          }}
          onClick={() => {
            choose("c");
          }}
        >
          Beside
        </button>
      </div>
      <Heading />
    </>
  );
}

/** The page as the shell holds it, with a way for the test to take the last row away. */
function Shell() {
  const [focus] = useState(createDetailFocus);
  const [rows, setRows] = useState<readonly string[]>(ROWS);
  return (
    <DetailFocusContext value={focus}>
      <Page rows={rows} />
      <button
        type="button"
        hidden
        onClick={() => {
          setRows(ROWS.slice(0, -1));
        }}
      >
        Drop the last row
      </button>
    </DetailFocusContext>
  );
}

function renderPage(path = "/lines") {
  const router = createMemoryRouter([{ path: "*", element: <Shell /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return {
    user: userEvent.setup(),
    search: () => router.state.location.search,
    // Clicked by the element, so the focus stays where it is.
    dropLastRow: () => {
      act(() => {
        screen.getByText("Drop the last row").click();
      });
    },
  };
}

const row = (key: string) => screen.getByRole("row", { name: `Row ${key}` });

describe("useTableDetailFocus", () => {
  it("takes the focus to the heading for a row chosen with Enter, and back to it on Escape", async () => {
    const { user, search } = renderPage();
    act(() => {
      row("b").focus();
    });
    await user.keyboard("{Enter}");
    expect(search()).toBe("?line=b");
    expect(screen.getByRole("heading", { name: "Panel" })).toHaveFocus();
    // Escape in the panel is the panel's own. Escape on the table, on another row than the one
    // that opened it, closes it too, and the focus goes back to that row.
    act(() => {
      row("a").focus();
    });
    await user.keyboard("{Escape}");
    expect(search()).toBe("");
    expect(row("b")).toHaveFocus();
  });

  it("leaves the focus on a row that is pressed", async () => {
    const { user, search } = renderPage();
    await user.click(row("a"));
    expect(search()).toBe("?line=a");
    expect(row("a")).toHaveFocus();
  });

  it("takes the focus to the heading on Enter on the row that is open already", async () => {
    const { user } = renderPage("/lines?line=b");
    act(() => {
      row("b").focus();
    });
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Panel" })).toHaveFocus();
  });

  it("gives the focus to the table when the row that opened the panel is gone", async () => {
    const { user, search, dropLastRow } = renderPage();
    await user.click(row("c"));
    dropLastRow();
    act(() => {
      row("a").focus();
    });
    await user.keyboard("{Escape}");
    expect(search()).toBe("");
    expect(screen.getByRole("grid", { name: "Rows" })).toHaveFocus();
  });

  it("gives the focus back to the control beside the table that opened the panel", async () => {
    const { user, search } = renderPage();
    const beside = screen.getByRole("button", { name: "Beside" });
    act(() => {
      beside.focus();
    });
    await user.keyboard("{Enter}");
    expect(search()).toBe("?line=c");
    expect(screen.getByRole("heading", { name: "Panel" })).toHaveFocus();
    act(() => {
      beside.focus();
    });
    // Escape beside the table closes the panel as well.
    await user.keyboard("{Escape}");
    expect(search()).toBe("");
    expect(beside).toHaveFocus();
  });

  it("leaves Escape to what handled it already", async () => {
    const { user, search } = renderPage("/lines?line=a");
    row("a").addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.preventDefault();
    });
    act(() => {
      row("a").focus();
    });
    await user.keyboard("{Escape}");
    expect(search()).toBe("?line=a");
  });
});
