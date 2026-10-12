import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatDays,
  formatList,
  formatLongDate,
  formatPercent,
  formatTime,
  isSameSecond,
  parseDateInput,
  parseTimeInput,
  toDateInput,
  toTimeInput,
  yearOf,
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

describe("formatLongDate and formatTime", () => {
  it("reads a date back with its weekday and its month in full", () => {
    expect(formatLongDate("2026-10-07T08:00:00")).toBe("Wednesday, 7 October 2026");
    expect(formatLongDate("2026-10-07")).toBe("Wednesday, 7 October 2026");
    expect(formatLongDate("soon")).toBe("soon");
  });

  it("writes the time on a 24-hour clock", () => {
    expect(formatTime("2026-09-30T14:05:00")).toBe("14:05");
    expect(formatTime("2026-09-30T00:00:00")).toBe("00:00");
    expect(formatTime("soon")).toBe("soon");
  });
});

describe("what a date field and a time field hold", () => {
  it("writes the date and the time of a moment as the fields hold them", () => {
    expect(toDateInput("2026-10-07T08:00:00")).toBe("2026-10-07");
    expect(toTimeInput("2026-10-07T08:00:00")).toBe("08:00");
    expect(toDateInput("0987-01-02T03:04:05")).toBe("0987-01-02");
  });

  it("keeps the seconds of a moment that has some, and drops a fraction of a second", () => {
    expect(toTimeInput("2026-10-07T14:05:37")).toBe("14:05:37");
    expect(toTimeInput("2026-10-07T14:05:37.250")).toBe("14:05:37");
  });

  it("writes nothing for text that is no moment", () => {
    expect(toDateInput("soon")).toBe("");
    expect(toTimeInput("")).toBe("");
  });

  it("reads a typed date in year, month, day order, with the usual separators", () => {
    expect(parseDateInput("2026-10-07")).toBe("2026-10-07");
    expect(parseDateInput(" 2026/10/7 ")).toBe("2026-10-07");
    expect(parseDateInput("2026.1.5")).toBe("2026-01-05");
    expect(parseDateInput("1999-12-31")).toBe("1999-12-31");
  });

  it("refuses a date that is not a day of the calendar or not in that order", () => {
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("2026-13-01")).toBeNull();
    expect(parseDateInput("07/10/2026")).toBeNull();
    expect(parseDateInput("7 Oct 2026")).toBeNull();
    expect(parseDateInput("")).toBeNull();
  });

  it("reads a typed time on a 24-hour clock, with or without seconds", () => {
    expect(parseTimeInput("08:00")).toBe("08:00:00");
    expect(parseTimeInput("8:05")).toBe("08:05:00");
    expect(parseTimeInput("14.05")).toBe("14:05:00");
    expect(parseTimeInput("14:05:37")).toBe("14:05:37");
  });

  it("refuses a time that is not a time of day", () => {
    expect(parseTimeInput("24:00")).toBeNull();
    expect(parseTimeInput("12:60")).toBeNull();
    expect(parseTimeInput("2 pm")).toBeNull();
    expect(parseTimeInput("")).toBeNull();
  });

  it("goes from a moment to the fields and back without changing it", () => {
    const moment = "2026-10-07T14:05:37";
    const date = parseDateInput(toDateInput(moment));
    const time = parseTimeInput(toTimeInput(moment));
    expect(`${date ?? ""}T${time ?? ""}`).toBe(moment);
  });
});

describe("yearOf and isSameSecond", () => {
  it("gives the year of a moment or a date", () => {
    expect(yearOf("2026-10-07T08:00:00")).toBe(2026);
    expect(yearOf("1999-12-31")).toBe(1999);
    expect(yearOf("soon")).toBeNull();
  });

  it("tells two moments apart to the second and no finer", () => {
    expect(isSameSecond("2026-10-07T08:00:00", "2026-10-07T08:00:00.731")).toBe(true);
    expect(isSameSecond("2026-10-07T08:00:00", "2026-10-07 08:00")).toBe(true);
    expect(isSameSecond("2026-10-07T08:00:00", "2026-10-07T08:00:01")).toBe(false);
    expect(isSameSecond("soon", "soon")).toBe(false);
  });
});
