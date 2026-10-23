import { useQuery } from "@tanstack/react-query";
import { api } from "../api/commands";
import { keys } from "../api/keys";
import { formatDate } from "../text/format";

/** The date a smoke run reports, written as the format module writes every date. */
const SMOKE_DATE = "2026-09-30";

/**
 * Tells a smoke run that the first screen has rendered. The page the app opens on calls it: the
 * welcome page, or Overview when a workspace reopens. The call is sent once the page has been
 * drawn, and once while the page lives, whichever of them is shown first; a page shown later
 * sends nothing. It carries `formatDate` of 30 September 2026, so the run records how the
 * window's engine writes the month. Rust does nothing with it unless the run is a smoke run
 * (`HX_SMOKE=1`), and a failure says nothing.
 */
export function useSmokeReady(): void {
  useQuery({
    queryKey: keys.smoke,
    queryFn: () => api.smokeReady(formatDate(SMOKE_DATE)).catch(() => null),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
