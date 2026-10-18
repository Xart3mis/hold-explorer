import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import { destinations, needsWorkspace } from "./destinations";

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

  it("says that Overview, Breakdown, Lines, Blockers, and Settings are built and the other four are not", () => {
    expect(destinations.filter((destination) => destination.available).map(({ id }) => id)).toEqual(
      ["overview", "breakdown", "lines", "blockers", "settings"],
    );
  });

  it("has a name in the text catalog for every destination", () => {
    for (const { id } of destinations) {
      expect(en.destinations.name[id]).toMatch(/\S/);
    }
  });

  it("has a description for exactly the destinations that are not built", () => {
    const described: Record<string, string> = en.comingSoon.description;
    expect(Object.keys(described).sort()).toEqual(
      destinations
        .filter((destination) => !destination.available)
        .map(({ id }) => id)
        .sort(),
    );
    for (const text of Object.values(described)) expect(text).toMatch(/\S/);
  });

  it("says which destinations show something without a workspace", () => {
    expect(destinations.filter(({ id }) => !needsWorkspace(id)).map(({ id }) => id)).toEqual([
      "settings",
    ]);
  });
});
