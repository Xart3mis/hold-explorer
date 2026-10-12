import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatDays,
  formatList,
  formatPercent,
} from "./format";

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(846)).toBe("846");
    expect(formatCount(5042)).toBe("5,042");
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});

describe("formatList", () => {
  it("writes the items one after another, separated the way the locale separates a plain list", () => {
    expect(formatList(["xlsx", "csv", "txt"])).toBe("xlsx, csv, txt");
    expect(formatList(["xlsx"])).toBe("xlsx");
    expect(formatList([])).toBe("");
  });
});

describe("formatPercent", () => {
  it("writes a share of one as a whole percentage", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.45)).toBe("45%");
    expect(formatPercent(0.456)).toBe("46%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("formatDate", () => {
  it("writes day, short month, and year", () => {
    expect(formatDate("2026-09-30T14:05:00")).toBe("30 Sept 2026");
    expect(formatDate("2026-10-07")).toBe("7 Oct 2026");
  });

  it("shows the day the file gives, whatever the time zone of this machine", () => {
    expect(formatDate("2026-01-01T00:00:00")).toBe("1 Jan 2026");
    expect(formatDate("2026-12-31T23:59:59")).toBe("31 Dec 2026");
    expect(formatDate("2026-03-29T02:30:00")).toBe("29 Mar 2026");
  });

  it("reads fractions of a second and years before 100", () => {
    expect(formatDate("2026-09-30T14:05:00.123456")).toBe("30 Sept 2026");
    expect(formatDate("0099-02-03T00:00:00")).toBe("3 Feb 99");
  });

  it("returns a text it cannot read as it is, so nothing is shown that the source did not say", () => {
    expect(formatDate("31/02/2026")).toBe("31/02/2026");
    expect(formatDate("2026-02-31")).toBe("2026-02-31");
    expect(formatDate("")).toBe("");
  });
});

describe("formatDateTime", () => {
  it("adds the time on a 24-hour clock", () => {
    expect(formatDateTime("2026-09-30T14:05:00")).toBe("30 Sept 2026, 14:05");
    expect(formatDateTime("2026-10-07T00:00:00")).toBe("7 Oct 2026, 00:00");
    expect(formatDateTime("2026-10-07T09:07:59")).toBe("7 Oct 2026, 09:07");
  });

  it("takes a date without a time as midnight", () => {
    expect(formatDateTime("2026-10-07")).toBe("7 Oct 2026, 00:00");
  });

  it("returns a text it cannot read as it is", () => {
    expect(formatDateTime("yesterday")).toBe("yesterday");
    expect(formatDateTime("2026-10-07T25:00:00")).toBe("2026-10-07T25:00:00");
  });
});

describe("formatDays", () => {
  it("writes days the way the export does", () => {
    expect(formatDays(0)).toBe("0 d");
    expect(formatDays(71)).toBe("71 d");
    expect(formatDays(1204)).toBe("1,204 d");
  });
});
