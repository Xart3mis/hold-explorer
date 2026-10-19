import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CHOICE, readChoice, writeChoice, type ExportChoice } from "./choices";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("the remembered choice of a screen", () => {
  it("is every column, all rows, and the status of the filters when none was saved", () => {
    expect(DEFAULT_CHOICE).toEqual({ columns: [], rows: "all", status: "filters" });
    expect(readChoice("lines")).toEqual(DEFAULT_CHOICE);
  });

  it("is read back as it was written, under hx.export and the screen", () => {
    const choice: ExportChoice = {
      columns: ["line", "holds", "oldest"],
      rows: "selected",
      status: "Released",
    };
    writeChoice("lines", choice);
    expect(window.localStorage.getItem("hx.export.lines")).not.toBeNull();
    expect(readChoice("lines")).toEqual(choice);
  });

  it("is kept for each screen apart", () => {
    writeChoice("blockers", { columns: ["blocker", "step"], rows: "loaded", status: "All" });
    expect(readChoice("breakdown")).toEqual(DEFAULT_CHOICE);
    expect(readChoice("blockers")).toEqual({
      columns: ["blocker", "step"],
      rows: "loaded",
      status: "All",
    });
  });

  it("drops the columns the screen no longer has, and keeps the others in table order", () => {
    window.localStorage.setItem(
      "hx.export.holds",
      JSON.stringify({ columns: ["remark", "gone", "line", "age"], rows: "all", status: "Open" }),
    );
    expect(readChoice("holds")).toEqual({
      columns: ["line", "remark"],
      rows: "all",
      status: "Open",
    });
  });

  it("keeps no column on a screen whose file has no column choice", () => {
    writeChoice("overview", { columns: ["line"], rows: "selected", status: "All" });
    expect(readChoice("overview").columns).toEqual([]);
  });

  it("takes the default for each part that cannot be read", () => {
    window.localStorage.setItem(
      "hx.export.lines",
      JSON.stringify({ columns: "line", rows: "some", status: "Closed" }),
    );
    expect(readChoice("lines")).toEqual(DEFAULT_CHOICE);
    window.localStorage.setItem("hx.export.lines", "{not json");
    expect(readChoice("lines")).toEqual(DEFAULT_CHOICE);
    window.localStorage.setItem("hx.export.lines", "[1, 2]");
    expect(readChoice("lines")).toEqual(DEFAULT_CHOICE);
    window.localStorage.setItem("hx.export.lines", JSON.stringify({ columns: ["line", 3] }));
    expect(readChoice("lines")).toEqual({ ...DEFAULT_CHOICE, columns: ["line"] });
  });

  it("is the default when storage refuses to be read, and writing to it does no harm", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The storage is not available.", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The storage is full.", "QuotaExceededError");
    });
    expect(() => {
      writeChoice("lines", { columns: ["line"], rows: "loaded", status: "All" });
    }).not.toThrow();
    expect(readChoice("lines")).toEqual(DEFAULT_CHOICE);
  });

  it("gets back the column that names the rows when a stored choice lacks it", () => {
    window.localStorage.setItem(
      "hx.export.lines",
      JSON.stringify({ columns: ["oldest", "holds"], rows: "all", status: "filters" }),
    );
    expect(readChoice("lines").columns).toEqual(["line", "holds", "oldest"]);
    window.localStorage.setItem(
      "hx.export.blockers",
      JSON.stringify({ columns: ["gain"], rows: "all", status: "filters" }),
    );
    expect(readChoice("blockers").columns).toEqual(["blocker", "gain"]);
    window.localStorage.setItem(
      "hx.export.blockers",
      JSON.stringify({ columns: ["step"], rows: "all", status: "filters" }),
    );
    expect(readChoice("blockers").columns).toEqual(["blocker", "step"]);
    // No column chosen stays every column.
    window.localStorage.setItem(
      "hx.export.holds",
      JSON.stringify({ columns: [], rows: "all", status: "filters" }),
    );
    expect(readChoice("holds").columns).toEqual([]);
  });
});
