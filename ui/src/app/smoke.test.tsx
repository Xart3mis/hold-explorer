import { mockIPC } from "@tauri-apps/api/mocks";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { chooseImportFile } from "../api/dialogs";
import en from "../locales/en.json";
import { renderApp } from "../test/app";
import { openStart, startState } from "../test/fixtures";
import { mockCommands } from "../test/ipc";
import { formatDate } from "../text/format";
import { queryClient, startQuery } from "./query";

/** Renders the app and keeps each `smoke_ready` it sends, with whether `heading` was on screen then. */
function renderCounting(start: ReturnType<typeof startState>, heading: string) {
  const sent: { sample: string; rendered: boolean }[] = [];
  const view = renderApp({
    start,
    path: "/",
    handlers: {
      smoke_ready: ({ sample }) => {
        sent.push({ sample, rendered: screen.queryByRole("heading", { name: heading }) !== null });
        return null;
      },
    },
  });
  return { ...view, sent };
}

describe("the smoke call", () => {
  it("is sent once the welcome page has rendered, with the date of the format module", async () => {
    const { sent } = renderCounting(startState(), en.workspaces.title);
    await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent).toEqual([{ sample: formatDate("2026-09-30"), rendered: true }]);
    expect(sent[0]?.sample).toMatch(/^30 Sept? 2026$/);
  });

  it("is sent once Overview has rendered when a workspace reopens, and not again on another page", async () => {
    const { sent, router } = renderCounting(openStart(), en.destinations.name.overview);
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]).toEqual({ sample: formatDate("2026-09-30"), rendered: true });
    await router.navigate("/welcome");
    await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    await router.navigate("/overview");
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
    expect(sent).toHaveLength(1);
  });
});

describe("the application start", () => {
  it("tells the dialogs module which build it is in", async () => {
    queryClient.clear();
    mockCommands({
      app_start: () => startState({ e2e: true }),
      e2e_open_path: () => "/tmp/run/Holds.xlsx",
    });
    await queryClient.query(startQuery);
    await expect(chooseImportFile()).resolves.toBe("/tmp/run/Holds.xlsx");
    const asked: string[] = [];
    mockIPC((command) => {
      asked.push(command);
      return command === "app_start" ? startState({ e2e: false }) : null;
    });
    queryClient.clear();
    await queryClient.query(startQuery);
    await chooseImportFile();
    expect(asked).toEqual(["app_start", "plugin:dialog|open"]);
  });
});
