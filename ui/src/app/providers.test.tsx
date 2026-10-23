import { useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keys } from "../api/keys";
import type { AppStart } from "../bindings/AppStart";
import type { Density } from "../bindings/Density";
import type { Theme } from "../bindings/Theme";
import { useToast } from "../components/ToastRegion/ToastRegion";
import { applyTheme } from "../design/theme";
import { commandFailure, mockCommands } from "../test/ipc";
import { AppProviders } from "./providers";
import { queryClient, startQuery } from "./query";

function start(theme: Theme, density: Density = "Comfortable"): AppStart {
  return {
    version: "0.1.0",
    settings_file: "/home/ada/.config/hold-explorer/settings.json",
    logs_folder: "/home/ada/.local/share/hold-explorer/logs",
    settings: {
      theme,
      density,
      author_name: "",
      workspace_dir: null,
      workspace_folder_chosen: false,
      last_workspace: null,
    },
    list: { workspaces: [], unreadable: [], folder: "workspaces" },
    list_error: null,
    open: null,
    settings_problem: null,
  };
}

function Page() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast.show({ message: "Workspace renamed." });
      }}
    >
      Rename
    </button>
  );
}

const root = document.documentElement;

afterEach(() => {
  applyTheme("Dark");
  root.removeAttribute("data-theme");
  root.removeAttribute("data-density");
  vi.unstubAllGlobals();
});

describe("AppProviders", () => {
  it("renders its children at once, before the application start has answered", () => {
    // A command answers on a later turn of the event loop, so right after render it has not yet.
    mockCommands({ app_start: () => start("Light") });
    render(
      <AppProviders>
        <p>content</p>
      </AppProviders>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("applies the saved theme as soon as the application start is known", async () => {
    mockCommands({ app_start: () => start("Light") });
    render(
      <AppProviders>
        <p>content</p>
      </AppProviders>,
    );
    await waitFor(() => {
      expect(root).toHaveAttribute("data-theme", "light");
    });
  });

  it("reads the application start through the query client, under the shared key", async () => {
    const appStart = vi.fn(() => start("Dark"));
    mockCommands({ app_start: appStart });
    render(
      <AppProviders>
        <p>content</p>
      </AppProviders>,
    );
    await waitFor(() => {
      expect(queryClient.getQueryData(keys.start)).toEqual(start("Dark"));
    });
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(appStart).toHaveBeenCalledTimes(1);
  });

  it("asks for the application start once, however many parts of the app read it", async () => {
    const appStart = vi.fn(() => start("Dark"));
    mockCommands({ app_start: appStart });
    function Reader({ name }: { name: string }) {
      const { data } = useQuery(startQuery);
      return <p>{data ? `${name} ${data.version}` : name}</p>;
    }
    const { rerender } = render(
      <AppProviders>
        <Reader name="first" />
      </AppProviders>,
    );
    expect(await screen.findByText("first 0.1.0")).toBeInTheDocument();

    // A reader that mounts later, and one that reads the key with options of its own.
    function Late() {
      const { data } = useQuery({ queryKey: keys.start, queryFn: appStart });
      return <p>{data ? "late 0.1.0" : "late"}</p>;
    }
    rerender(
      <AppProviders>
        <Reader name="first" />
        <Reader name="second" />
        <Late />
      </AppProviders>,
    );
    expect(await screen.findByText("second 0.1.0")).toBeInTheDocument();
    expect(await screen.findByText("late 0.1.0")).toBeInTheDocument();
    expect(appStart).toHaveBeenCalledTimes(1);
  });

  it("resolves System before applying it", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    mockCommands({ app_start: () => start("System") });
    render(
      <AppProviders>
        <p>content</p>
      </AppProviders>,
    );
    await waitFor(() => {
      expect(root).toHaveAttribute("data-theme", "light");
    });
  });

  it("applies the saved density as soon as the application start is known", async () => {
    mockCommands({ app_start: () => start("Dark", "Compact") });
    render(
      <AppProviders>
        <p>content</p>
      </AppProviders>,
    );
    await waitFor(() => {
      expect(root).toHaveAttribute("data-density", "compact");
    });
  });

  it("keeps the page when the application start fails", async () => {
    mockCommands({
      app_start: () => {
        throw commandFailure("Settings", "The settings file could not be read.");
      },
    });
    render(
      <AppProviders>
        <p>content</p>
      </AppProviders>,
    );
    await waitFor(() => {
      expect(queryClient.getQueryState(keys.start)?.status).toBe("error");
    });
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("gives its children the toast region", async () => {
    mockCommands({ app_start: () => start("Dark") });
    const user = userEvent.setup();
    render(
      <AppProviders>
        <Page />
      </AppProviders>,
    );
    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByRole("status")).toHaveTextContent("Workspace renamed.");
  });
});
