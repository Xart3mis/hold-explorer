import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { useToast } from "../../components/ToastRegion/ToastRegion";
import { t } from "../../text/i18n";
import { changeStart } from "./start";

/**
 * The action that saves the author name. Unlike the theme and the density it is not applied
 * before it is saved: the field keeps what was typed, and the saved name (trimmed, as Rust
 * keeps it) is shown once the answer is there. Only the name is taken from the answer.
 *
 * A name is saved as the page is left, so the save can fail after the page is gone. The page
 * shows a failure beside the field while it is there; once it is gone, a toast says what was
 * not saved and why.
 */
export function useAuthorNameSetting() {
  const client = useQueryClient();
  const toast = useToast();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setAuthorName = useMutation({
    scope: { id: "settings" },
    mutationFn: (name: string) => api.setAuthorName(name),
    onSuccess: (settings) => {
      changeStart(client, (state) => ({
        ...state,
        settings: { ...state.settings, author_name: settings.author_name },
      }));
    },
    onError: (error, name) => {
      if (mounted.current) return;
      toast.show({
        message: t("settings.authorNameNotSaved", {
          name: name.trim(),
          reason: asCommandError(error).message,
        }),
      });
    },
  });

  return { setAuthorName };
}
