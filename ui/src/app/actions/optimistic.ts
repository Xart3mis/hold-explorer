import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { keys } from "../../api/keys";
import type { AppStart } from "../../bindings/AppStart";
import type { Settings } from "../../bindings/Settings";
import { changeStart } from "./start";

/**
 * Changes of the settings are sent one after another as well, so the last one asked for is the
 * last one saved. Every action that saves a setting (the theme, the density, the author name,
 * the update check, a skipped version) runs in this scope.
 */
export const SETTINGS_SCOPE = { id: "settings" };

/** The settings that are applied at once, before they are saved. */
export type OptimisticField = "theme" | "density" | "update_check";

/**
 * What is known about the changes of the settings that are on their way. The cached start shows
 * the value that was asked for last, at once; `saved` keeps the value the settings file is known
 * to hold, to go back to when the last change fails.
 */
interface Changes {
  /** The number of the change that was asked for last, per setting. */
  latest: Record<OptimisticField, number>;
  /** The value the settings file holds, as far as the answers say, per setting. */
  saved: { [F in OptimisticField]: Settings[F] | undefined };
}

const changesOf = new WeakMap<QueryClient, Changes>();

function changesFor(client: QueryClient): Changes {
  let changes = changesOf.get(client);
  if (!changes) {
    changes = {
      latest: { theme: 0, density: 0, update_check: 0 },
      saved: { theme: undefined, density: undefined, update_check: undefined },
    };
    changesOf.set(client, changes);
  }
  return changes;
}

type Value<F extends OptimisticField> = Settings[F];

/** Sets one field of the cached settings. */
function setField<F extends OptimisticField>(client: QueryClient, field: F, value: Value<F>) {
  changeStart(client, (state) => ({ ...state, settings: { ...state.settings, [field]: value } }));
}

/**
 * The action that changes a setting that is applied at once: the theme, the density, or whether a
 * newer release is looked for at start. It is no action on the open workspace: it runs beside
 * them, and nothing waits for it. See ui/src/app/actions/start.ts for what every action does.
 *
 * The cached start shows the value that was asked for last, at once (AppProviders applies what
 * the cached start holds). A later choice that is still on its way stays on screen when an
 * earlier one is answered. A value that could not be saved is not kept: only the change that was
 * asked for last goes back, and it goes back to the value that is saved. Only the field itself is
 * taken from an answer; the other settings are other actions' to change.
 */
export function useOptimisticSetting<F extends OptimisticField>(
  field: F,
  call: (value: Value<F>) => Promise<Settings>,
) {
  const client = useQueryClient();
  const mutationKey = [`${field}Change`];

  return useMutation({
    scope: SETTINGS_SCOPE,
    mutationKey,
    mutationFn: call,
    onMutate: (value) => {
      const changes = changesFor(client);
      // This change is in the cache already; with no other on its way, the value on screen is
      // the saved one. The cache says so, not a count of this module, so a cache that was
      // cleared (as the tests clear it after each) leaves nothing counted behind.
      if (client.isMutating({ mutationKey }) <= 1) {
        changes.saved[field] = client.getQueryData<AppStart>(keys.start)?.settings[field];
      }
      changes.latest[field] += 1;
      setField(client, field, value);
      return { change: changes.latest[field] };
    },
    onSuccess: (settings, _value, asked) => {
      const changes = changesFor(client);
      changes.saved[field] = settings[field];
      changeStart(client, (state) => {
        const shown =
          asked.change === changes.latest[field] ? settings[field] : state.settings[field];
        return { ...state, settings: { ...state.settings, [field]: shown } };
      });
    },
    // An earlier change that fails leaves a later one alone.
    onError: (_error, _value, asked) => {
      const { latest, saved } = changesFor(client);
      const back = saved[field];
      if (asked?.change !== latest[field] || back === undefined) return;
      setField(client, field, back);
    },
  });
}
