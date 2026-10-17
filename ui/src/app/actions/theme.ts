import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../../api/commands";
import { keys } from "../../api/keys";
import type { AppStart } from "../../bindings/AppStart";
import type { Theme } from "../../bindings/Theme";
import { changeStart } from "./start";

/** Changes of the settings are sent one after another as well, so the last one asked for is the last one saved. */
const SETTINGS_SCOPE = { id: "settings" };

/**
 * What is known about the changes of the theme that are on their way. The cached start shows the
 * theme that was asked for last, at once; this keeps the theme the settings file is known to
 * hold, to go back to when the last change fails.
 */
interface ThemeChanges {
  /** The number of the change that was asked for last. */
  latest: number;
  /** How many changes have been asked for and not yet answered. */
  waiting: number;
  /** The theme the settings file holds, as far as the answers say. */
  saved: Theme | undefined;
}

const themeChanges = new WeakMap<QueryClient, ThemeChanges>();

function themeChangesOf(client: QueryClient): ThemeChanges {
  let changes = themeChanges.get(client);
  if (!changes) {
    changes = { latest: 0, waiting: 0, saved: undefined };
    themeChanges.set(client, changes);
  }
  return changes;
}

/**
 * Forgets the changes of the theme counted for `client`. The app has one client for its whole
 * life and never needs this; the tests share that client and clear it after each test, and a test
 * that ended with a change on its way would leave it counted for the next.
 */
export function resetThemeChanges(client: QueryClient): void {
  themeChanges.delete(client);
}

/**
 * The action that changes the theme. It is no action on the open workspace: it runs beside them,
 * and nothing waits for it. See ui/src/app/actions/start.ts for what every action does.
 */
export function useThemeSetting() {
  const client = useQueryClient();

  const setTheme = useMutation({
    scope: SETTINGS_SCOPE,
    mutationFn: (theme: Theme) => api.setTheme(theme),
    // The theme is applied at once: AppProviders applies whatever theme the cached start holds.
    onMutate: (theme) => {
      const changes = themeChangesOf(client);
      if (changes.waiting === 0) {
        changes.saved = client.getQueryData<AppStart>(keys.start)?.settings.theme;
      }
      changes.waiting += 1;
      changes.latest += 1;
      changeStart(client, (state) => ({ ...state, settings: { ...state.settings, theme } }));
      return { change: changes.latest };
    },
    // The settings are now what the command says. A later choice that is still on its way stays
    // on screen.
    onSuccess: (settings, _theme, asked) => {
      const changes = themeChangesOf(client);
      changes.saved = settings.theme;
      changeStart(client, (state) => ({
        ...state,
        settings:
          asked.change === changes.latest ? settings : { ...settings, theme: state.settings.theme },
      }));
    },
    // A theme that could not be saved is not kept: the next start would not have it. Only the
    // change that was asked for last goes back, and it goes back to the theme that is saved. An
    // earlier change that fails leaves a later one alone.
    onError: (_error, _theme, asked) => {
      const { latest, saved } = themeChangesOf(client);
      if (asked?.change !== latest || saved === undefined) return;
      changeStart(client, (state) => ({ ...state, settings: { ...state.settings, theme: saved } }));
    },
    onSettled: (_settings, _error, _theme, asked) => {
      if (asked !== undefined) themeChangesOf(client).waiting -= 1;
    },
  });

  return { setTheme };
}
