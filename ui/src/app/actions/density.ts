import { api } from "../../api/commands";
import { useOptimisticSetting } from "./optimistic";

/** The action that changes the density; see `useOptimisticSetting`. */
export function useDensitySetting() {
  const setDensity = useOptimisticSetting("density", api.setDensity);
  return { setDensity };
}
