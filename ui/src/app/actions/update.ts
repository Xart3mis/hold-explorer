import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/commands";
import { keys } from "../../api/keys";
import type { UpdateNotice } from "../../bindings/UpdateNotice";
import { SETTINGS_SCOPE, useOptimisticSetting } from "./optimistic";
import { changeStart } from "./start";

/** The action that turns the check for a newer release on or off; see `useOptimisticSetting`. */
export function useUpdateCheckSetting() {
  const setUpdateCheck = useOptimisticSetting("update_check", api.setUpdateCheck);
  return { setUpdateCheck };
}

/**
 * The check for a newer release and what can be done about the version it found. The check is
 * asked once, by the shell once the start is known, and never again while the page lives: not on
 * a timer, not when the window is shown. Rust decides whether a check is due and makes the request;
 * a check that fails says nothing, here too.
 *
 * `notice` is the version to tell about, or `null`. Skipping it hides it at once and saves it; a
 * press of the close button hides it for this session only. Opening the release page leaves it.
 */
export function useUpdateNotice() {
  const client = useQueryClient();
  const check = useQuery({
    queryKey: keys.update,
    queryFn: (): Promise<UpdateNotice | null> => api.updateCheck().catch(() => null),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const hide = () => {
    client.setQueryData<UpdateNotice | null>(keys.update, null);
  };
  const skip = useMutation({
    scope: SETTINGS_SCOPE,
    mutationFn: (version: string) => api.updateSkip(version),
    onMutate: hide,
    onSuccess: (settings) => {
      changeStart(client, (state) => ({
        ...state,
        settings: { ...state.settings, skipped_version: settings.skipped_version },
      }));
    },
  });
  const openPage = useMutation({
    mutationFn: (version: string) => api.openReleasePage(version),
  });
  return { notice: check.data ?? null, hide, skip, openPage };
}
