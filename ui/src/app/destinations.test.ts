import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import { destinations } from "./destinations";

describe("destinations", () => {
  it("lists the nine destinations in sidebar order", () => {
    expect(destinations.map((destination) => destination.id)).toEqual([
      "overview",
      "breakdown",
      "lines",
      "blockers",
      "history",
      "people",
      "follow-up",
      "rules",
      "settings",
    ]);
  });

  it("puts the first seven in the data group and Rules and Settings in the setup group", () => {
    expect(destinations.map((destination) => destination.group)).toEqual([
      ...Array<string>(7).fill("data"),
      "setup",
      "setup",
    ]);
  });

  it("gives each destination the address of its name", () => {
    expect(destinations.map((destination) => destination.path)).toEqual([
      "/overview",
      "/breakdown",
      "/lines",
      "/blockers",
      "/history",
      "/people",
      "/follow-up",
      "/rules",
      "/settings",
    ]);
  });

  it("gives the first seven Ctrl+1 to Ctrl+7 and Settings Ctrl+,", () => {
    expect(destinations.map((destination) => destination.shortcut)).toEqual([
      "Ctrl+1",
      "Ctrl+2",
      "Ctrl+3",
      "Ctrl+4",
      "Ctrl+5",
      "Ctrl+6",
      "Ctrl+7",
      undefined,
      "Ctrl+,",
    ]);
  });

  it("says that Overview and Settings are built and the other seven are not", () => {
    expect(destinations.filter((destination) => destination.available).map(({ id }) => id)).toEqual(
      ["overview", "settings"],
    );
  });

  it("has a name and a description in the text catalog for every destination", () => {
    for (const { id } of destinations) {
      expect(en.destinations.name[id]).toMatch(/\S/);
      expect(en.comingSoon.description[id]).toMatch(/\S/);
    }
  });
});
