import { api } from "../../api/commands";
import { useOptimisticSetting } from "./optimistic";

/** The action that changes the theme; see `useOptimisticSetting`. */
export function useThemeSetting() {
  const setTheme = useOptimisticSetting("theme", api.setTheme);
  return { setTheme };
}
