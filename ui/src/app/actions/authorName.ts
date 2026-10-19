import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/commands";
import { changeStart } from "./start";

/**
 * The action that saves the author name. Unlike the theme and the density it is not applied
 * before it is saved: the field keeps what was typed, and the saved name (trimmed, as Rust
 * keeps it) is shown once the answer is there. Only the name is taken from the answer.
 */
export function useAuthorNameSetting() {
  const client = useQueryClient();

  const setAuthorName = useMutation({
    scope: { id: "settings" },
    mutationFn: (name: string) => api.setAuthorName(name),
    onSuccess: (settings) => {
      changeStart(client, (state) => ({
        ...state,
        settings: { ...state.settings, author_name: settings.author_name },
      }));
    },
  });

  return { setAuthorName };
}
