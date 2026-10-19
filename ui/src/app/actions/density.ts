import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../../api/commands";
import { keys } from "../../api/keys";
import type { AppStart } from "../../bindings/AppStart";
import type { Density } from "../../bindings/Density";
import { changeStart } from "./start";

/** Changes of the settings are sent one after another, so the last one asked for is the last one saved. */
const SETTINGS_SCOPE = { id: "settings" };
/** The changes of the density in the mutation cache, which says how many are still on their way. */
const DENSITY_CHANGE = ["densityChange"];

/** What is known about the changes of the density that are on their way, as for the theme. */
interface DensityChanges {
  /** The number of the change that was asked for last. */
  latest: number;
  /** The density the settings file holds, as far as the answers say. */
  saved: Density | undefined;
}

const densityChanges = new WeakMap<QueryClient, DensityChanges>();

function densityChangesOf(client: QueryClient): DensityChanges {
  let changes = densityChanges.get(client);
  if (!changes) {
    changes = { latest: 0, saved: undefined };
    densityChanges.set(client, changes);
  }
  return changes;
}

/**
 * The action that changes the density, in the way of `useThemeSetting`: the cached start shows
 * the density that was asked for last, at once, and goes back to the saved one when the last
 * change fails. It is no action on the open workspace.
 */
export function useDensitySetting() {
  const client = useQueryClient();

  const setDensity = useMutation({
    scope: SETTINGS_SCOPE,
    mutationKey: DENSITY_CHANGE,
    mutationFn: (density: Density) => api.setDensity(density),
    onMutate: (density) => {
      const changes = densityChangesOf(client);
      if (client.isMutating({ mutationKey: DENSITY_CHANGE }) <= 1) {
        changes.saved = client.getQueryData<AppStart>(keys.start)?.settings.density;
      }
      changes.latest += 1;
      changeStart(client, (state) => ({ ...state, settings: { ...state.settings, density } }));
      return { change: changes.latest };
    },
    // Only the density is taken from the answer: the other settings are other actions' to change.
    onSuccess: (settings, _density, asked) => {
      const changes = densityChangesOf(client);
      changes.saved = settings.density;
      changeStart(client, (state) => ({
        ...state,
        settings: {
          ...state.settings,
          density: asked.change === changes.latest ? settings.density : state.settings.density,
        },
      }));
    },
    onError: (_error, _density, asked) => {
      const { latest, saved } = densityChangesOf(client);
      if (asked?.change !== latest || saved === undefined) return;
      changeStart(client, (state) => ({
        ...state,
        settings: { ...state.settings, density: saved },
      }));
    },
  });

  return { setDensity };
}
